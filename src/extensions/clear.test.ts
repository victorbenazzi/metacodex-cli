import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerClear, runClearCommand } from "./clear.js";

type NotifyKind = "error" | "info" | "warning";

type CommandSpec = {
  description?: string;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};

function createHarness(options?: { cancelled?: boolean }) {
  const commands = new Map<string, CommandSpec>();
  const notices: { message: string; type?: NotifyKind }[] = [];
  const newSessionCalls: unknown[] = [];

  const ui = {
    notify(message: string, type?: NotifyKind) {
      notices.push(type === undefined ? { message } : { message, type });
    },
  };

  const ctx = {
    ui,
    async newSession(opts?: {
      withSession?: (next: { ui: typeof ui }) => Promise<void>;
    }) {
      newSessionCalls.push(opts);
      if (options?.cancelled) return { cancelled: true };
      await opts?.withSession?.({ ui });
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
