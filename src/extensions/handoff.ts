import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { curatedSessionModels, findCuratedByPiId, isCuratedPiProvider, parseProviderModel } from "../catalog.js";
import {
  formatModelRows,
  formatProviderPickRows,
  parseModelRow,
  parseProviderPickRow,
  providersInModels,
  sortModelsForPicker,
} from "../picker.js";
import { isEnterKey } from "./auth-redirect.js";
import {
  buildHandoffPacket,
  deriveHandoffFields,
  HANDOFF_CUSTOM_TYPE,
  hasConversationTurns,
  isCrossProvider,
  listHandoffTargets,
  shouldCompactForHandoff,
  type HandoffPacketInput,
  type HandoffSourceMessage,
} from "../router/handoff.js";

const CANCEL = "Cancel";

type SessionModel = NonNullable<ExtensionContext["model"]>;

type SessionSwitchContext = ExtensionContext & {
  isIdle?: () => boolean;
  waitForIdle?: () => Promise<void>;
};

export function modelCommandArgs(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === "/model") return "";
  if (trimmed.startsWith("/model ")) return trimmed.slice("/model ".length).trim();
  return undefined;
}

function pickerPool(ctx: ExtensionContext): SessionModel[] {
  return curatedSessionModels({
    scoped: ctx.scopedModels,
    available: ctx.modelRegistry.getAvailable(),
  });
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

function injectPacket(pi: ExtensionAPI, packet: string, triggerTurn: boolean): void {
  pi.sendMessage(
    {
      customType: HANDOFF_CUSTOM_TYPE,
      content: packet,
      display: true,
    },
    triggerTurn ? { triggerTurn: true, deliverAs: "followUp" } : { triggerTurn: false },
  );
}

function compactIfNeeded(
  ctx: Pick<ExtensionContext, "compact" | "ui">,
  fromWindow: number,
  toWindow: number,
): Promise<boolean> {
  if (!shouldCompactForHandoff(fromWindow, toWindow)) return Promise.resolve(true);
  return new Promise((resolve) => {
    ctx.compact({
      onComplete: () => resolve(true),
      onError: () => {
        ctx.ui.notify("Handoff compact failed. Staying on the current model.", "error");
        resolve(false);
      },
    });
  });
}

async function pickDestination(
  args: string,
  ctx: ExtensionContext,
  current: SessionModel,
  title: string,
  includeCurrent = false,
): Promise<SessionModel | undefined> {
  const pool = pickerPool(ctx);
  const targets = includeCurrent ? pool : listHandoffTargets(pool, current);
  if (targets.length === 0) {
    ctx.ui.notify("No other curated model is connected. Use /auth.", "error");
    return undefined;
  }

  const fromArgs = parseProviderModel(args);
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

  const providers = providersInModels(targets);
  let providerId = providers[0]?.piId;
  if (!providerId) return undefined;

  if (providers.length > 1) {
    const picked = await ctx.ui.select(title, [...formatProviderPickRows(providers), CANCEL]);
    if (!picked || picked === CANCEL) return undefined;
    const id = parseProviderPickRow(picked, providers);
    if (!id) return undefined;
    providerId = id;
  }

  const models = targets.filter((model) => model.provider === providerId);
  const label = findCuratedByPiId(providerId)?.label ?? providerId;
  const heading = providers.length > 1 ? `${title} · ${label}` : title;
  const rows = formatModelRows(models, includeCurrent ? current : undefined);
  const picked = await ctx.ui.select(heading, [...rows, CANCEL]);
  if (!picked || picked === CANCEL) return undefined;
  const parsed = parseModelRow(picked, providerId, models);
  if (!parsed) return undefined;
  const match = models.find((model) => model.provider === parsed.provider && model.id === parsed.id);
  if (!match) return undefined;
  if (match.provider === current.provider && match.id === current.id) {
    ctx.ui.notify("Already using that model.", "info");
    return undefined;
  }
  return match;
}

async function switchTo(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  dest: SessionModel,
): Promise<boolean> {
  const ok = await pi.setModel(dest);
  if (!ok) {
    ctx.ui.notify(`No API key for ${dest.provider}/${dest.id}`, "error");
    return false;
  }
  return true;
}

async function waitIfBusy(ctx: SessionSwitchContext): Promise<void> {
  if (ctx.isIdle && !ctx.isIdle()) await ctx.waitForIdle?.();
}

async function runHandoffCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!ctx.model) {
    ctx.ui.notify("No current model. Connect a provider with /auth.", "error");
    return;
  }
  await waitIfBusy(ctx);

  const from = ctx.model;
  const dest = await pickDestination(args, ctx, from, "Handoff to");
  if (!dest) return;

  const messages = sourceMessages(ctx);
  if (!hasConversationTurns(messages)) {
    if (!(await switchTo(ctx, pi, dest))) return;
    ctx.ui.notify(`Switched to ${dest.provider}/${dest.id}`, "info");
    return;
  }

  const instruction = await ctx.ui.input("Optional instruction for the next model");
  if (instruction === undefined) return;

  const packet = buildPacket(from, dest, messages, instruction);
  if (!(await compactIfNeeded(ctx, from.contextWindow, dest.contextWindow))) return;
  if (!(await switchTo(ctx, pi, dest))) return;
  injectPacket(pi, packet, true);
  ctx.ui.notify(`Handed off to ${dest.provider}/${dest.id}`, "info");
}

async function runModelCommand(
  args: string,
  ctx: SessionSwitchContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!ctx.model) {
    ctx.ui.notify("No current model. Connect a provider with /auth.", "error");
    return;
  }
  await waitIfBusy(ctx);

  const from = ctx.model;
  const dest = await pickDestination(args, ctx, from, "Switch model", true);
  if (!dest) return;

  const messages = sourceMessages(ctx);
  const cross =
    isCrossProvider(from.provider, dest.provider) &&
    isCuratedPiProvider(dest.provider) &&
    hasConversationTurns(messages);
  if (cross) {
    if (!(await compactIfNeeded(ctx, from.contextWindow, dest.contextWindow))) return;
  }
  if (!(await switchTo(ctx, pi, dest))) return;
  if (!cross) return;

  injectPacket(pi, buildPacket(from, dest, messages), false);
  ctx.ui.notify(`Handed off to ${dest.provider}/${dest.id}`, "info");
}

export function registerHandoff(pi: ExtensionAPI): void {
  let lastTargets: SessionModel[] = [];
  let stopModelRedirect: (() => void) | undefined;

  const rememberTargets = (ctx: ExtensionContext): void => {
    lastTargets = sortModelsForPicker(listHandoffTargets(pickerPool(ctx), ctx.model));
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
      await runHandoffCommand(args, ctx, pi);
    },
  });

  pi.on("session_shutdown", () => {
    stopModelRedirect?.();
    stopModelRedirect = undefined;
  });

  pi.on("session_start", (_event, ctx) => {
    rememberTargets(ctx);
    stopModelRedirect?.();
    if (ctx.mode !== "tui") return;
    stopModelRedirect = ctx.ui.onTerminalInput((data) => {
      if (!isEnterKey(data)) return;
      const args = modelCommandArgs(ctx.ui.getEditorText());
      if (args === undefined) return;
      ctx.ui.setEditorText("");
      void runModelCommand(args, ctx, pi);
      return { consume: true };
    });
  });

  pi.on("model_select", (_event, ctx) => {
    rememberTargets(ctx);
  });
}
