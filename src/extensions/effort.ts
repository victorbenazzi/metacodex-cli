import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const CANCEL = "Cancel";

/** Canonical Pi thinking levels. Same union as `ExtensionAPI.getThinkingLevel()`. */
export type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;

export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ThinkingLevel[];

export type ThinkingModel = {
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
};

type ThinkingLevelApi = ExtensionAPI & {
  getAvailableThinkingLevels?: () => ThinkingLevel[];
};

export function isThinkingLevel(value: string | undefined): value is ThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value ?? "");
}

export function formatEffortOption(level: ThinkingLevel, current: ThinkingLevel): string {
  return level === current ? `${level}  (current)` : level;
}

export function parseEffortOption(option: string): ThinkingLevel | undefined {
  const id = option.trim().split(/\s+/)[0]?.toLowerCase();
  return isThinkingLevel(id) ? id : undefined;
}

export function parseEffortArg(
  args: string,
  supported: readonly ThinkingLevel[],
): ThinkingLevel | undefined {
  const level = parseEffortOption(args);
  if (!level) return undefined;
  return supported.includes(level) ? level : undefined;
}

export function supportedThinkingLevels(model: ThinkingModel): ThinkingLevel[] {
  if (!model.reasoning) return ["off"];
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}

function availableLevels(pi: ExtensionAPI, model: ThinkingModel): ThinkingLevel[] {
  const fromPi = (pi as ThinkingLevelApi).getAvailableThinkingLevels?.();
  if (fromPi) return fromPi;
  return supportedThinkingLevels(model);
}

function applyEffort(pi: ExtensionAPI, ctx: Pick<ExtensionContext, "ui">, level: ThinkingLevel): void {
  pi.setThinkingLevel(level);
  ctx.ui.notify(`Effort: ${level}`, "info");
}

async function runEffortCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!ctx.model) {
    ctx.ui.notify("No current model. Connect a provider with /auth.", "error");
    return;
  }

  const supported = availableLevels(pi, ctx.model);
  const trimmed = args.trim();
  if (trimmed) {
    const level = parseEffortArg(trimmed, supported);
    if (!level) {
      const token = trimmed.split(/\s+/)[0] ?? trimmed;
      ctx.ui.notify(`Effort "${token}" is not available.`, "error");
      return;
    }
    applyEffort(pi, ctx, level);
    return;
  }

  const current = ctx.thinkingLevel ?? pi.getThinkingLevel();
  const picked = await ctx.ui.select("Effort", [
    ...supported.map((level) => formatEffortOption(level, current)),
    CANCEL,
  ]);
  if (!picked || picked === CANCEL) return;
  const level = parseEffortArg(picked, supported);
  if (!level) return;
  applyEffort(pi, ctx, level);
}

export function registerEffort(pi: ExtensionAPI): void {
  let lastLevels: ThinkingLevel[] = [];
  let lastCurrent: ThinkingLevel | undefined;

  const remember = (ctx: ExtensionContext): void => {
    if (!ctx.model) {
      lastLevels = [];
      lastCurrent = undefined;
      return;
    }
    lastLevels = availableLevels(pi, ctx.model);
    lastCurrent = ctx.thinkingLevel ?? pi.getThinkingLevel();
  };

  pi.on("session_start", (_event, ctx) => {
    remember(ctx);
  });
  pi.on("model_select", (_event, ctx) => {
    remember(ctx);
  });
  pi.on("thinking_level_select", (_event, ctx) => {
    remember(ctx);
  });

  pi.registerCommand("effort", {
    description: "Set this session's thinking effort",
    getArgumentCompletions: (prefix) => {
      const q = prefix.trim().toLowerCase();
      return lastLevels
        .filter((level) => !q || level.startsWith(q))
        .map((level) =>
          level === lastCurrent
            ? { value: level, label: level, description: "current" }
            : { value: level, label: level },
        );
    },
    handler: async (args, ctx) => {
      remember(ctx);
      await runEffortCommand(args, ctx, pi);
    },
  });
}
