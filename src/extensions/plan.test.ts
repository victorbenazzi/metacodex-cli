import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { PLAN_OFF_NOTICE, PLAN_ON_NOTICE, PLAN_STATUS_KEY, PLAN_SYSTEM_PROMPT } from "../router/plan.js";
import { registerPlan } from "./plan.js";

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

type CommandSpec = {
  description?: string;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => { value: string; label: string }[];
};

function createHarness() {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, CommandSpec>();
  const shortcuts = new Map<string, (ctx: ExtensionCommandContext) => void | Promise<void>>();
  const notices: { message: string; type?: string }[] = [];
  const statuses = new Map<string, string | undefined>();

  const ctx = {
    ui: {
      notify(message: string, type?: string) {
        notices.push(type === undefined ? { message } : { message, type });
      },
      setStatus(key: string, text: string | undefined) {
        statuses.set(key, text);
      },
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
    registerCommand(name: string, spec: CommandSpec) {
      commands.set(name, spec);
    },
    registerShortcut(key: string, spec: { handler: (ctx: ExtensionCommandContext) => void | Promise<void> }) {
      shortcuts.set(key, spec.handler);
    },
  };

  registerPlan(pi as unknown as ExtensionAPI);

  return {
    commands,
    shortcuts,
    notices,
    statuses,
    ctx: ctx as unknown as ExtensionCommandContext,
    emit,
  };
}

describe("registerPlan", () => {
  it("toggles with /plan and Shift+Tab, and shows status", async () => {
    const harness = createHarness();
    const spec = harness.commands.get("plan");
    expect(spec?.description).toMatch(/plan mode/i);

    await spec?.handler("", harness.ctx);
    expect(harness.statuses.get(PLAN_STATUS_KEY)).toBe("plan");
    expect(harness.notices).toEqual([{ message: PLAN_ON_NOTICE, type: "info" }]);

    await spec?.handler("off", harness.ctx);
    expect(harness.statuses.get(PLAN_STATUS_KEY)).toBeUndefined();
    expect(harness.notices.at(-1)).toEqual({ message: PLAN_OFF_NOTICE, type: "info" });

    await harness.shortcuts.get("shift+tab")?.(harness.ctx);
    expect(harness.statuses.get(PLAN_STATUS_KEY)).toBe("plan");
  });

  it("blocks write, edit, and spawn, and lets read through", async () => {
    const harness = createHarness();
    await harness.commands.get("plan")?.handler("on", harness.ctx);

    expect(await harness.emit("tool_call", { toolName: "read", input: { path: "a.ts" } })).toBeUndefined();
    expect(await harness.emit("tool_call", { toolName: "write", input: { path: "a.ts" } })).toEqual({
      block: true,
      reason: expect.stringContaining("File writes"),
    });
    expect(await harness.emit("tool_call", { toolName: "edit", input: { path: "a.ts" } })).toMatchObject({
      block: true,
    });
    expect(await harness.emit("tool_call", { toolName: "spawn", input: { prompt: "x" } })).toMatchObject({
      block: true,
      reason: expect.stringContaining("spawn"),
    });
  });

  it("allows read-only bash and refuses mutating bash, including ! commands", async () => {
    const harness = createHarness();
    await harness.commands.get("plan")?.handler("on", harness.ctx);

    expect(await harness.emit("tool_call", { toolName: "bash", input: { command: "ls src" } })).toBeUndefined();
    expect(await harness.emit("tool_call", { toolName: "bash", input: { command: "rm a.ts" } })).toMatchObject({
      block: true,
    });
    expect(await harness.emit("user_bash", { command: "rm a.ts" })).toMatchObject({
      result: { exitCode: 1, cancelled: false },
    });
  });

  it("appends the plan prompt only while enabled, and resets on a new session", async () => {
    const harness = createHarness();
    await harness.commands.get("plan")?.handler("on", harness.ctx);
    expect(await harness.emit("before_agent_start", { systemPrompt: "base" })).toEqual({
      systemPrompt: `base\n\n${PLAN_SYSTEM_PROMPT}`,
    });

    await harness.emit("session_start", { reason: "new" });
    expect(harness.statuses.get(PLAN_STATUS_KEY)).toBeUndefined();
    expect(await harness.emit("before_agent_start", { systemPrompt: "base" })).toBeUndefined();
    expect(await harness.emit("tool_call", { toolName: "write", input: {} })).toBeUndefined();
  });
});
