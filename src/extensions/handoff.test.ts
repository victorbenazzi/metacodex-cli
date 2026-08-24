import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { HANDOFF_CUSTOM_TYPE } from "../router/handoff.js";
import { registerHandoff } from "./handoff.js";

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

function model(provider: string, id: string, contextWindow: number) {
  return { provider, id, name: id, contextWindow };
}

function createHarness(options?: { instruction?: string | undefined }) {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<
    string,
    { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }
  >();
  const packets: { customType: string; content: string; display: boolean }[] = [];
  const setModels: { provider: string; id: string }[] = [];
  const notices: string[] = [];
  let compactCalls = 0;

  const anthropic = model("anthropic", "opus", 200_000);
  const deepseek = model("deepseek", "deepseek-chat", 64_000);
  const available = [anthropic, deepseek];

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
      buildContextEntries: () => [
        { type: "message", message: { role: "user", content: "cover the hop" } },
        {
          type: "message",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                name: "edit",
                arguments: { path: "src/router/fallback.ts" },
              },
            ],
          },
        },
      ],
    },
    compact: (opts?: { onComplete?: (result: never) => void }) => {
      compactCalls += 1;
      opts?.onComplete?.(undefined as never);
    },
    ui: {
      notify: (message: string) => {
        notices.push(message);
      },
      select: async () => undefined,
      input: async () => options?.instruction,
    },
  };

  async function emit(type: string, event: Record<string, unknown> = {}) {
    let result: unknown;
    for (const handler of handlers.get(type) ?? []) {
      result = await handler({ type, ...event }, ctx);
    }
    return result;
  }

  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand(
      name: string,
      spec: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> },
    ) {
      commands.set(name, spec);
    },
    async setModel(next: { provider: string; id: string; name: string; contextWindow: number }) {
      const previous = ctx.model;
      ctx.model = next;
      setModels.push(next);
      await emit("model_select", { model: next, previousModel: previous, source: "set" });
      return true;
    },
    sendMessage(message: { customType: string; content: string; display: boolean }) {
      packets.push(message);
    },
  };

  registerHandoff(pi as unknown as ExtensionAPI);

  return {
    commands,
    ctx: ctx as unknown as ExtensionCommandContext,
    packets,
    setModels,
    notices,
    get compactCalls() {
      return compactCalls;
    },
    emit,
  };
}

describe("registerHandoff", () => {
  it("injects a packet on /handoff, switches model, and does not double-inject via model_select", async () => {
    const harness = createHarness({ instruction: "finish the tests only" });
    await harness.emit("session_start");
    await harness.commands.get("handoff")?.handler("deepseek/deepseek-chat", harness.ctx);

    expect(harness.setModels).toEqual([
      { provider: "deepseek", id: "deepseek-chat", name: "deepseek-chat", contextWindow: 64_000 },
    ]);
    expect(harness.packets).toHaveLength(1);
    expect(harness.packets[0]?.customType).toBe(HANDOFF_CUSTOM_TYPE);
    expect(harness.packets[0]?.content).toContain("This session is a handoff");
    expect(harness.packets[0]?.content).toContain("Previous model: anthropic/opus");
    expect(harness.packets[0]?.content).toContain("Your model: deepseek/deepseek-chat");
    expect(harness.packets[0]?.content).toContain("cover the hop");
    expect(harness.packets[0]?.content).toContain("User instruction for this handoff:");
    expect(harness.packets[0]?.content).toContain("finish the tests only");
    expect(harness.compactCalls).toBe(1);
    expect(harness.notices.some((n) => n.startsWith("Handed off to deepseek/"))).toBe(true);
  });

  it("injects a packet on /model across providers, without an instruction prompt", async () => {
    const harness = createHarness();
    await harness.emit("session_start");
    await harness.emit("model_select", {
      model: model("deepseek", "deepseek-chat", 64_000),
      previousModel: model("anthropic", "opus", 200_000),
      source: "set",
    });
    expect(harness.packets).toHaveLength(1);
    expect(harness.packets[0]?.content).toContain("This session is a handoff");
    expect(harness.packets[0]?.content).not.toContain("User instruction");
  });

  it("does not inject on same-provider /model or session restore", async () => {
    const harness = createHarness();
    await harness.emit("model_select", {
      model: model("anthropic", "sonnet", 200_000),
      previousModel: model("anthropic", "opus", 200_000),
      source: "set",
    });
    await harness.emit("model_select", {
      model: model("deepseek", "deepseek-chat", 64_000),
      previousModel: model("anthropic", "opus", 200_000),
      source: "restore",
    });
    expect(harness.packets).toHaveLength(0);
  });
});
