import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerClear, runClearCommand } from "./clear.js";

type CommandSpec = {
  description?: string;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};

function createHarness(options?: { cancelled?: boolean }) {
  const commands = new Map<string, CommandSpec>();
  const notices: { message: string; type?: string }[] = [];
  const newSessionCalls: unknown[] = [];

  const ctx = {
    ui: {
      notify(message: string, type?: string) {
        notices.push(type === undefined ? { message } : { message, type });
      },
    },
    async newSession(opts?: {
      withSession?: (next: { ui: { notify: (message: string, type?: string) => void } }) => Promise<void>;
    }) {
      newSessionCalls.push(opts);
      if (options?.cancelled) return { cancelled: true };
      await opts?.withSession?.(ctx);
      return { cancelled: false };
    },
  } as unknown as ExtensionCommandContext;

  const pi = {
    registerCommand(name: string, spec: CommandSpec) {
      commands.set(name, spec);
    },
  } as unknown as ExtensionAPI;

  return { commands, notices, newSessionCalls, ctx, pi };
}

describe("registerClear", () => {
  it("registers /clear as an alias for /new", async () => {
    const harness = createHarness();
    registerClear(harness.pi);

    const spec = harness.commands.get("clear");
    expect(spec?.description).toContain("/new");
    await spec?.handler("", harness.ctx);

    expect(harness.newSessionCalls).toHaveLength(1);
    expect(harness.notices).toEqual([{ message: "New session started", type: "info" }]);
  });
});

describe("runClearCommand", () => {
  it("does not notify when the session switch is cancelled", async () => {
    const harness = createHarness({ cancelled: true });
    await runClearCommand(harness.ctx);
    expect(harness.newSessionCalls).toHaveLength(1);
    expect(harness.notices).toEqual([]);
  });
});
