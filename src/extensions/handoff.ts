import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isCuratedPiProvider } from "../catalog.js";
import {
  buildHandoffPacket,
  deriveHandoffFields,
  formatHandoffOption,
  HANDOFF_CUSTOM_TYPE,
  isCrossProvider,
  listHandoffTargets,
  parseHandoffOption,
  shouldCompactForHandoff,
  type HandoffPacketInput,
  type HandoffSourceMessage,
} from "../router/handoff.js";

const CANCEL = "Cancel";

type SessionModel = NonNullable<ExtensionContext["model"]>;

function pickerPool(ctx: ExtensionContext): SessionModel[] {
  if (ctx.scopedModels.length > 0) return ctx.scopedModels.map((scoped) => scoped.model);
  return ctx.modelRegistry.getAvailable();
}

function sourceMessages(ctx: ExtensionContext): HandoffSourceMessage[] {
  return ctx.sessionManager.buildContextEntries().flatMap((entry) => {
    if (entry.type !== "message") return [];
    return [entry.message];
  });
}

function buildPacket(
  from: { provider: string; id: string },
  to: { provider: string; id: string },
  messages: HandoffSourceMessage[],
  userInstruction?: string,
): string {
  const fields = deriveHandoffFields(messages);
  const input: HandoffPacketInput = {
    fromProvider: from.provider,
    fromModel: from.id,
    toProvider: to.provider,
    toModel: to.id,
    inProgress: fields.inProgress,
    alreadyDone: fields.alreadyDone,
    doNotRedo: fields.doNotRedo,
  };
  const trimmed = userInstruction?.trim();
  if (trimmed) input.userInstruction = trimmed;
  return buildHandoffPacket(input);
}

function injectPacket(pi: ExtensionAPI, packet: string): void {
  pi.sendMessage(
    {
      customType: HANDOFF_CUSTOM_TYPE,
      content: packet,
      display: true,
    },
    { triggerTurn: false },
  );
}

function compactIfNeeded(
  ctx: Pick<ExtensionContext, "compact">,
  fromWindow: number,
  toWindow: number,
): Promise<void> {
  if (!shouldCompactForHandoff(fromWindow, toWindow)) return Promise.resolve();
  return new Promise((resolve) => {
    ctx.compact({
      onComplete: () => resolve(),
      onError: () => resolve(),
    });
  });
}

async function pickDestination(
  args: string,
  ctx: ExtensionCommandContext,
  current: SessionModel,
): Promise<SessionModel | undefined> {
  const targets = listHandoffTargets(pickerPool(ctx), current);
  if (targets.length === 0) {
    ctx.ui.notify("No other curated model is connected. Use /auth.", "error");
    return undefined;
  }

  const fromArgs = parseHandoffOption(args);
  if (fromArgs) {
    if (fromArgs.provider === current.provider && fromArgs.id === current.id) {
      ctx.ui.notify("Already using that model.", "info");
      return undefined;
    }
    const match = targets.find((model) => model.provider === fromArgs.provider && model.id === fromArgs.id);
    if (match) return match;
    ctx.ui.notify(`Model ${fromArgs.provider}/${fromArgs.id} is not available.`, "error");
    return undefined;
  }

  const picked = await ctx.ui.select("Handoff to", [
    ...targets.map((model) => formatHandoffOption(model)),
    CANCEL,
  ]);
  if (!picked || picked === CANCEL) return undefined;
  const parsed = parseHandoffOption(picked);
  if (!parsed) return undefined;
  return targets.find((model) => model.provider === parsed.provider && model.id === parsed.id);
}

async function runHandoffCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  gate: { suppressSelectPacket: boolean },
): Promise<void> {
  if (!ctx.model) {
    ctx.ui.notify("No current model. Connect a provider with /auth.", "error");
    return;
  }
  if (!ctx.isIdle()) await ctx.waitForIdle();

  const from = ctx.model;
  const dest = await pickDestination(args, ctx, from);
  if (!dest) return;

  const instruction = await ctx.ui.input("Optional instruction for the next model");
  if (instruction === undefined) return;

  const packet = buildPacket(from, dest, sourceMessages(ctx), instruction);
  await compactIfNeeded(ctx, from.contextWindow, dest.contextWindow);

  gate.suppressSelectPacket = true;
  try {
    const ok = await pi.setModel(dest);
    if (!ok) {
      ctx.ui.notify(`No API key for ${dest.provider}/${dest.id}`, "error");
      return;
    }
    injectPacket(pi, packet);
    ctx.ui.notify(`Handed off to ${dest.provider}/${dest.id}`, "info");
  } finally {
    gate.suppressSelectPacket = false;
  }
}

export function registerHandoff(pi: ExtensionAPI): void {
  const gate = { suppressSelectPacket: false };
  let lastTargets: SessionModel[] = [];

  const rememberTargets = (ctx: ExtensionContext): void => {
    lastTargets = listHandoffTargets(pickerPool(ctx), ctx.model);
  };

  pi.registerCommand("handoff", {
    description: "Hand off this session to another curated model",
    getArgumentCompletions: (prefix) => {
      const q = prefix.trim().toLowerCase();
      return lastTargets
        .filter((model) => {
          const value = `${model.provider}/${model.id}`;
          return !q || value.toLowerCase().startsWith(q) || model.id.toLowerCase().includes(q);
        })
        .map((model) => ({
          value: `${model.provider}/${model.id}`,
          label: model.name,
          description: model.provider,
        }));
    },
    handler: async (args, ctx) => {
      rememberTargets(ctx);
      await runHandoffCommand(args, ctx, pi, gate);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    rememberTargets(ctx);
  });

  pi.on("model_select", async (event, ctx) => {
    rememberTargets(ctx);
    if (gate.suppressSelectPacket) return;
    if (event.source === "restore") return;
    if (!event.previousModel) return;
    if (!isCrossProvider(event.previousModel.provider, event.model.provider)) return;
    if (!isCuratedPiProvider(event.model.provider)) return;

    const packet = buildPacket(event.previousModel, event.model, sourceMessages(ctx));
    await compactIfNeeded(ctx, event.previousModel.contextWindow, event.model.contextWindow);
    injectPacket(pi, packet);
    ctx.ui.notify(`Handed off to ${event.model.provider}/${event.model.id}`, "info");
  });
}
