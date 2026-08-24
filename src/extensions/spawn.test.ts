import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SPAWN_TOOL_NAME } from "../router/subagent.js";
import { oscAttention } from "../osc.js";
import { registerSpawn, SPAWN_REPORT_CUSTOM_TYPE, type ChildRunRequest } from "./spawn.js";

type ToolExecute = (
  toolCallId: string,
  params: {
    description: string;
    prompt: string;
    model?: string;
    background?: boolean;
    tools?: string[];
    skills?: string[];
  },
  signal: AbortSignal | undefined,
  onUpdate: ((partial: { content: { type: "text"; text: string }[]; details: unknown }) => void) | undefined,
  ctx: ExtensionContext,
) => Promise<{ content: { type: "text"; text: string }[]; details: unknown }>;

function createHarness(runChild: (request: ChildRunRequest) => Promise<{ ok: boolean; report: string }>) {
  const tools: { name: string; execute: ToolExecute }[] = [];
  const shutdown: Array<() => void> = [];
  const agentStart: Array<(event: unknown, ctx: ExtensionContext) => void> = [];
  const messages: { customType: string; content: string; display?: boolean }[] = [];
  const progress: string[] = [];
  const osc: string[] = [];

  const ctx = {
    cwd: "/tmp/mcx-spawn",
    model: { provider: "anthropic", id: "opus" },
    scopedModels: [],
    thinkingLevel: undefined,
    signal: undefined as AbortSignal | undefined,
    modelRegistry: {
      getAvailable: () => [{ provider: "anthropic", id: "opus" }],
      find: (provider: string, id: string) =>
        provider === "anthropic" && id === "opus" ? { provider, id } : undefined,
    },
  };

  const pi = {
    on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
      if (event === "session_shutdown") shutdown.push(() => handler({}, ctx as unknown as ExtensionContext));
      if (event === "agent_start") agentStart.push(handler);
    },
    registerTool(tool: { name: string; execute: ToolExecute }) {
      tools.push(tool);
    },
    sendMessage(message: { customType: string; content: string; display?: boolean }) {
      messages.push(message);
    },
  };

  registerSpawn(pi as unknown as ExtensionAPI, {
    runChild: async (request) => runChild(request),
    writeOsc: (sequence) => {
      osc.push(sequence);
    },
  });

  const spawn = tools.find((tool) => tool.name === SPAWN_TOOL_NAME);
  if (!spawn) throw new Error("spawn tool was not registered");

  return {
    ctx: ctx as unknown as ExtensionContext,
    spawn,
    messages,
    progress,
    osc,
    shutdown,
    emitAgentStart(signal?: AbortSignal) {
      ctx.signal = signal;
      for (const handler of agentStart) handler({}, ctx as unknown as ExtensionContext);
    },
    async run(
      params: Parameters<ToolExecute>[1],
      signal?: AbortSignal,
    ) {
      return spawn.execute("call-1", params, signal, (partial) => {
        const text = partial.content[0]?.text;
        if (text) progress.push(text);
      }, ctx as unknown as ExtensionContext);
    },
  };
}

describe("registerSpawn", () => {
  it("runs in the foreground, wraps the brief, and never gives the child spawn", async () => {
    const seen: ChildRunRequest[] = [];
    const harness = createHarness(async (request) => {
      seen.push(request);
      request.onProgress("bash  ls");
      return { ok: true, report: "found the grant" };
    });

    const result = await harness.run({
      description: "scan grants",
      prompt: "find the grant check",
      tools: ["read", "spawn", "write"],
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.brief).toContain("You do not have the parent transcript");
    expect(seen[0]?.brief).toContain("find the grant check");
    expect(seen[0]?.tools).toEqual(["read", "write"]);
    expect(seen[0]?.skills).toEqual([]);
    expect(result.content[0]?.text).toContain("found the grant");
    expect(harness.progress).toContain("bash  ls");
  });

  it("caps live children at 3", async () => {
    let release: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = createHarness(async () => {
      await blocker;
      return { ok: true, report: "done" };
    });

    const first = harness.run({ description: "a", prompt: "one" });
    const second = harness.run({ description: "b", prompt: "two" });
    const third = harness.run({ description: "c", prompt: "three" });
    await Promise.resolve();
    const fourth = await harness.run({ description: "d", prompt: "four" });

    expect(fourth.content[0]?.text).toContain("Already 3 live subagents");
    release?.();
    await Promise.all([first, second, third]);
  });

  it("returns immediately for background spawn and later injects a report", async () => {
    let finish: ((result: { ok: boolean; report: string }) => void) | undefined;
    const harness = createHarness(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const started = await harness.run({
      description: "bg scan",
      prompt: "look around",
      background: true,
    });
    expect(started.content[0]?.text).toBe("Spawned in background: bg scan");
    expect(harness.messages).toHaveLength(0);

    finish?.({ ok: true, report: "all good" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.messages).toEqual([
      {
        customType: SPAWN_REPORT_CUSTOM_TYPE,
        content: "Subagent finished (bg scan):\nall good",
        display: true,
      },
    ]);
  });

  it("reports a thrown background child instead of leaving an unhandled rejection", async () => {
    const harness = createHarness(async () => {
      throw new Error("runner exploded");
    });

    const started = await harness.run({
      description: "bg boom",
      prompt: "look around",
      background: true,
    });
    expect(started.content[0]?.text).toBe("Spawned in background: bg boom");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.messages).toEqual([
      {
        customType: SPAWN_REPORT_CUSTOM_TYPE,
        content: "Subagent failed (bg boom): runner exploded",
        display: true,
      },
    ]);
    expect(harness.osc).toEqual([oscAttention("subagent failed", "bg boom")]);
  });

  it("aborts live children when the parent agent run is aborted", async () => {
    const seen: AbortSignal[] = [];
    let release: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = createHarness(async (request) => {
      seen.push(request.signal);
      await blocker;
      return { ok: request.signal.aborted ? false : true, report: request.signal.aborted ? "spawn aborted" : "done" };
    });

    const started = await harness.run({
      description: "bg scan",
      prompt: "look around",
      background: true,
    });
    expect(started.content[0]?.text).toBe("Spawned in background: bg scan");
    await Promise.resolve();

    const parentAbort = new AbortController();
    harness.emitAgentStart(parentAbort.signal);
    parentAbort.abort();
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen[0]?.aborted).toBe(true);
    expect(harness.messages[0]?.content).toContain("spawn aborted");
  });

  it("emits OSC 99 when a child fails", async () => {
    const harness = createHarness(async () => ({ ok: false, report: "grep exploded" }));
    const result = await harness.run({ description: "scan grants", prompt: "find it" });
    expect(result.content[0]?.text).toContain("grep exploded");
    expect(harness.osc).toEqual([oscAttention("subagent failed", "scan grants")]);
  });
});
