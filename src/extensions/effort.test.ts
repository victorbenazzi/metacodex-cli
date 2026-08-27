import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  formatEffortOption,
  parseEffortArg,
  parseEffortOption,
  registerEffort,
  supportedThinkingLevels,
  type ThinkingLevel,
} from "./effort.js";

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

type CommandSpec = {
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => { value: string; label: string; description?: string }[];
};

function model(options?: {
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
}) {
  return {
    provider: "anthropic",
    id: "opus",
    name: "opus",
    reasoning: options?.reasoning ?? true,
    ...(options?.thinkingLevelMap ? { thinkingLevelMap: options.thinkingLevelMap } : {}),
  };
}

function createHarness(options?: {
  model?: ReturnType<typeof model> | undefined;
  thinkingLevel?: ThinkingLevel;
  pick?: string | undefined;
  getAvailableThinkingLevels?: () => ThinkingLevel[];
}) {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, CommandSpec>();
  const notices: { message: string; type?: string }[] = [];
  const setLevels: ThinkingLevel[] = [];
  const selects: { title: string; options: string[] }[] = [];

  const ctx = {
    model: options?.model === undefined && !("model" in (options ?? {})) ? model() : options?.model,
    thinkingLevel: options?.thinkingLevel ?? ("medium" as ThinkingLevel),
    ui: {
      notify(message: string, type?: string) {
        notices.push(type === undefined ? { message } : { message, type });
      },
      async select(title: string, rows: string[]) {
        selects.push({ title, options: rows });
        return options?.pick;
      },
    },
  };

  async function emit(type: string, event: Record<string, unknown> = {}) {
    for (const handler of handlers.get(type) ?? []) {
      await handler({ type, ...event }, ctx);
    }
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
    getThinkingLevel() {
      return ctx.thinkingLevel;
    },
    setThinkingLevel(level: ThinkingLevel) {
      ctx.thinkingLevel = level;
      setLevels.push(level);
    },
    ...(options?.getAvailableThinkingLevels
      ? { getAvailableThinkingLevels: options.getAvailableThinkingLevels }
      : {}),
  };

  registerEffort(pi as unknown as ExtensionAPI);

  return {
    commands,
    ctx: ctx as unknown as ExtensionCommandContext,
    notices,
    setLevels,
    selects,
    emit,
  };
}

describe("effort option rows", () => {
  it("encodes the level first so we can round-trip the select label", () => {
    expect(parseEffortOption(formatEffortOption("high", "high"))).toBe("high");
    expect(parseEffortOption(formatEffortOption("high", "low"))).toBe("high");
    expect(parseEffortOption("xhigh  (current)")).toBe("xhigh");
    expect(parseEffortOption("Cancel")).toBeUndefined();
  });

  it("accepts a direct arg only when it is a supported level", () => {
    expect(parseEffortArg("high", ["off", "high"])).toBe("high");
    expect(parseEffortArg("  HIGH  ", ["off", "high"])).toBe("high");
    expect(parseEffortArg("max", ["off", "high"])).toBeUndefined();
    expect(parseEffortArg("nope", ["off", "high"])).toBeUndefined();
    expect(parseEffortArg("", ["off", "high"])).toBeUndefined();
  });
});

describe("supportedThinkingLevels", () => {
  it("hides null map entries and does not invent xhigh/max", () => {
    expect(supportedThinkingLevels({ reasoning: false })).toEqual(["off"]);
    expect(supportedThinkingLevels({ reasoning: true })).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(
      supportedThinkingLevels({
        reasoning: true,
        thinkingLevelMap: { minimal: null, xhigh: "xhigh", max: "max" },
      }),
    ).toEqual(["off", "low", "medium", "high", "xhigh", "max"]);
  });
});

describe("registerEffort", () => {
  it("opens a picker without args and sets the chosen level", async () => {
    const harness = createHarness({
      thinkingLevel: "medium",
      pick: formatEffortOption("high", "medium"),
    });
    await harness.emit("session_start");
    await harness.commands.get("effort")?.handler("", harness.ctx);

    expect(harness.selects).toHaveLength(1);
    expect(harness.selects[0]?.title).toBe("Effort");
    expect(harness.selects[0]?.options.at(-1)).toBe("Cancel");
    expect(harness.selects[0]?.options).toContain("medium  (current)");
    expect(harness.selects[0]?.options).toContain("high");
    expect(harness.setLevels).toEqual(["high"]);
    expect(harness.notices).toEqual([{ message: "Effort: high", type: "info" }]);
  });

  it("does not set on Cancel", async () => {
    const harness = createHarness({ pick: "Cancel" });
    await harness.emit("session_start");
    await harness.commands.get("effort")?.handler("", harness.ctx);

    expect(harness.selects).toHaveLength(1);
    expect(harness.setLevels).toEqual([]);
    expect(harness.notices).toEqual([]);
  });

  it("sets /effort high without a picker", async () => {
    const harness = createHarness();
    await harness.emit("session_start");
    await harness.commands.get("effort")?.handler("high", harness.ctx);

    expect(harness.selects).toEqual([]);
    expect(harness.setLevels).toEqual(["high"]);
    expect(harness.notices).toEqual([{ message: "Effort: high", type: "info" }]);
  });

  it("does not set an invalid or unsupported arg", async () => {
    const harness = createHarness({
      model: model({ reasoning: true, thinkingLevelMap: { high: null } }),
    });
    await harness.emit("session_start");
    await harness.commands.get("effort")?.handler("nope", harness.ctx);
    await harness.commands.get("effort")?.handler("high", harness.ctx);

    expect(harness.selects).toEqual([]);
    expect(harness.setLevels).toEqual([]);
    expect(harness.notices).toEqual([
      { message: 'Effort "nope" is not available.', type: "error" },
      { message: 'Effort "high" is not available.', type: "error" },
    ]);
  });

  it("completes currently supported levels", async () => {
    const harness = createHarness({
      thinkingLevel: "low",
      model: model({ reasoning: true, thinkingLevelMap: { xhigh: "xhigh" } }),
    });
    await harness.emit("session_start");
    const completions = harness.commands.get("effort")?.getArgumentCompletions?.("x") ?? [];
    expect(completions).toEqual([{ value: "xhigh", label: "xhigh" }]);

    const current = harness.commands.get("effort")?.getArgumentCompletions?.("l") ?? [];
    expect(current).toEqual([{ value: "low", label: "low", description: "current" }]);
  });

  it("asks for /auth when there is no model", async () => {
    const harness = createHarness({ model: undefined });
    await harness.emit("session_start");
    await harness.commands.get("effort")?.handler("high", harness.ctx);

    expect(harness.setLevels).toEqual([]);
    expect(harness.notices).toEqual([
      { message: "No current model. Connect a provider with /auth.", type: "error" },
    ]);
  });

  it("uses getAvailableThinkingLevels when the engine exposes it", async () => {
    const harness = createHarness({
      getAvailableThinkingLevels: () => ["off", "max"],
    });
    await harness.emit("session_start");
    await harness.commands.get("effort")?.handler("max", harness.ctx);
    await harness.commands.get("effort")?.handler("high", harness.ctx);

    expect(harness.setLevels).toEqual(["max"]);
    expect(harness.notices).toEqual([
      { message: "Effort: max", type: "info" },
      { message: 'Effort "high" is not available.', type: "error" },
    ]);
  });
});
