import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { HANDOFF_CUSTOM_TYPE } from "../router/handoff.js";
import { loadFallbackSettings, registerFallback, saveFallbackSettings } from "./fallback.js";
import { registerHandoff } from "./handoff.js";
import { createSelectPacketGate } from "./select-packet.js";

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;

function model(provider: string, id: string, contextWindow: number) {
  return { provider, id, contextWindow };
}

function createHarness(chain: string[], options?: { withHandoff?: boolean }) {
  const handlers = new Map<string, Handler[]>();
  const setModels: { provider: string; id: string }[] = [];
  const notices: string[] = [];
  const attention: string[] = [];
  const packets: { customType: string }[] = [];
  const statuses = new Map<string, string | undefined>();
  const selectPacketGate = createSelectPacketGate();

  const anthropic = model("anthropic", "opus", 200_000);
  const deepseek = model("deepseek", "deepseek-chat", 64_000);
  const kimi = model("kimi-coding", "kimi-k2", 256_000);
  const available = [anthropic, deepseek, kimi];

  const ctx = {
    model: anthropic,
    scopedModels: [] as { model: ReturnType<typeof model> }[],
    isIdle: () => true,
    waitForIdle: async () => {},
    modelRegistry: {
      getAvailable: () => available,
      find: (provider: string, id: string) =>
        available.find((item) => item.provider === provider && item.id === id),
    },
    sessionManager: {
      buildContextEntries: () => [],
    },
    compact: () => {},
    ui: {
      notify: (message: string) => {
        notices.push(message);
      },
      setStatus: (key: string, text: string | undefined) => {
        statuses.set(key, text);
      },
      setWorkingMessage: () => {},
      setTitle: () => {},
      select: async () => undefined,
      input: async () => undefined,
    },
  };

  async function emit(type: string, event: Record<string, unknown> = {}) {
    let result: unknown;
    for (const handler of handlers.get(type) ?? []) {
      result = await handler({ type, ...event }, ctx as unknown as ExtensionContext);
    }
    return result;
  }

  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand() {},
    sendMessage(message: { customType: string }) {
      packets.push(message);
    },
    async setModel(next: { provider: string; id: string; contextWindow: number }) {
      const previous = ctx.model;
      setModels.push(next);
      ctx.model = next;
      await emit("model_select", { model: next, previousModel: previous, source: "set" });
      return true;
    },
  };

  registerFallback(pi as unknown as ExtensionAPI, {
    loadSettings: () => ({ chain, maxHops: 2 }),
    onAttention: (kind) => {
      attention.push(kind);
    },
    selectPacketGate,
  });
  if (options?.withHandoff) {
    registerHandoff(pi as unknown as ExtensionAPI, { selectPacketGate });
  }

  return { emit, setModels, notices, statuses, attention, packets };
}

function assistantError(message: string, provider = "anthropic") {
  return {
    role: "assistant" as const,
    stopReason: "error",
    errorMessage: message,
    provider,
    content: [{ type: "text", text: "" }],
  };
}

describe("registerFallback", () => {
  it("hops on 429, shows a TUI notice, and strips the retry copy", async () => {
    const harness = createHarness(["anthropic", "deepseek"]);
    await harness.emit("session_start");
    await harness.emit("after_provider_response", { status: 429 });
    const error = assistantError("rate limited");
    await harness.emit("message_end", { message: error });
    await harness.emit("agent_end", { messages: [error] });

    expect(harness.setModels).toEqual([{ provider: "deepseek", id: "deepseek-chat", contextWindow: 64_000 }]);
    expect(harness.notices).toEqual(["retrying on deepseek (rate_limit anthropic)"]);
    expect(harness.statuses.get("mcx-fallback")).toBe("retrying on deepseek (rate_limit anthropic)");

    const stripped = (await harness.emit("context", {
      messages: [
        {
          role: "assistant",
          provider: "anthropic",
          reasoning: { tokens: 3 },
          content: [
            { type: "thinking", thinking: "secret" },
            { type: "text", text: "hello", cache_control: { type: "ephemeral" } },
          ],
        },
      ],
    })) as { messages: unknown[] };

    expect(stripped.messages).toEqual([
      {
        role: "assistant",
        provider: "anthropic",
        content: [{ type: "text", text: "hello" }],
      },
    ]);
  });

  it("does not hop when the chain is empty or the error is auth", async () => {
    const empty = createHarness([]);
    await empty.emit("after_provider_response", { status: 429 });
    const rate = assistantError("rate limited");
    await empty.emit("agent_end", { messages: [rate] });
    expect(empty.setModels).toEqual([]);
    expect(empty.attention).toEqual([]);

    const auth = createHarness(["anthropic", "deepseek"]);
    await auth.emit("after_provider_response", { status: 401 });
    const denied = assistantError("unauthorized");
    await auth.emit("agent_end", { messages: [denied] });
    expect(auth.setModels).toEqual([]);
    expect(auth.attention).toEqual(["auth"]);
    expect(auth.notices).toEqual(["auth failed"]);
  });

  it("signals OSC attention when a non-empty chain cannot hop further", async () => {
    const harness = createHarness(["anthropic", "deepseek"]);
    await harness.emit("after_provider_response", { status: 429 });
    const first = assistantError("rate limited");
    await harness.emit("agent_end", { messages: [first] });
    expect(harness.setModels).toHaveLength(1);

    await harness.emit("after_provider_response", { status: 429 });
    const second = assistantError("rate limited", "deepseek");
    await harness.emit("agent_end", { messages: [second] });
    expect(harness.attention).toEqual(["exhausted"]);
    expect(harness.notices.at(-1)).toBe("fallback chain exhausted");
  });

  it("lets Pi compact overflow first, then hops to a larger window and disguises the error so Pi retries", async () => {
    const harness = createHarness(["anthropic", "deepseek", "kimi-coding"]);
    const overflow = assistantError("maximum context length exceeded");

    await harness.emit("agent_end", { messages: [overflow] });
    expect(harness.setModels).toEqual([]);

    await harness.emit("session_compact", { reason: "overflow" });
    const rewritten = (await harness.emit("message_end", { message: overflow })) as {
      message: { errorMessage: string };
    };
    expect(rewritten.message.errorMessage.startsWith("rate limit:")).toBe(true);

    await harness.emit("agent_end", { messages: [overflow] });
    expect(harness.setModels).toEqual([
      { provider: "kimi-coding", id: "kimi-k2", contextWindow: 256_000 },
    ]);
    expect(harness.notices[0]).toBe("retrying on kimi (overflow_after_compact anthropic)");
  });

  it("does not inject a handoff packet when fallback hops to another provider", async () => {
    const harness = createHarness(["anthropic", "deepseek"], { withHandoff: true });
    await harness.emit("session_start");
    await harness.emit("after_provider_response", { status: 429 });
    const error = assistantError("rate limited");
    await harness.emit("agent_end", { messages: [error] });

    expect(harness.setModels).toHaveLength(1);
    expect(harness.packets.filter((packet) => packet.customType === HANDOFF_CUSTOM_TYPE)).toEqual([]);
    expect(harness.notices).toEqual(["retrying on deepseek (rate_limit anthropic)"]);
  });
});

describe("loadFallbackSettings", () => {
  it("reads fallback.chain from ~/.mcx settings.json", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-fallback-"));
    await writeFile(
      join(home, "settings.json"),
      JSON.stringify({ fallback: { chain: ["anthropic", "deepseek"], maxHops: 1 } }),
    );
    expect(await loadFallbackSettings(home)).toEqual({
      chain: ["anthropic", "deepseek"],
      maxHops: 1,
    });
  });

  it("merges fallback into existing settings without dropping enabledModels", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-fallback-save-"));
    await writeFile(join(home, "settings.json"), JSON.stringify({ enabledModels: ["anthropic/*"] }));
    await saveFallbackSettings(home, { chain: ["deepseek", "kimi-coding"], maxHops: 2 });
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      enabledModels: string[];
      fallback: { chain: string[]; maxHops: number };
    };
    expect(raw.enabledModels).toEqual(["anthropic/*"]);
    expect(raw.fallback).toEqual({ chain: ["deepseek", "kimi-coding"], maxHops: 2 });
  });
});
