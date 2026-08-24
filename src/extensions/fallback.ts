import { readFile, writeFile } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isCuratedPiProvider } from "../catalog.js";
import { mcxPaths } from "../home.js";
import {
  classifyProviderFailure,
  disguiseOverflowForRetry,
  isAuthFailure,
  parseFallbackSettings,
  planHop,
  type FallbackSettings,
  type HopCandidate,
  type ProviderFailure,
} from "../router/fallback.js";
import type { AttentionKind } from "./osc.js";
import { withoutSelectPacket, type SelectPacketGate } from "./select-packet.js";
import { stripForProvider, type RouterMessage } from "../router/strip.js";

type AssistantLike = {
  role: "assistant";
  stopReason?: string;
  errorMessage?: string;
  provider?: string;
};

interface FallbackState {
  hopIndex: number;
  compactedAlready: boolean;
  lastHttpStatus: number | undefined;
  pendingStrip: boolean;
}

export type LoadFallbackSettings = () => Promise<FallbackSettings> | FallbackSettings;

export type FallbackAttention = (kind: AttentionKind) => void;

function emptySettings(): FallbackSettings {
  return parseFallbackSettings(undefined);
}

export async function loadFallbackSettings(agentDir: string): Promise<FallbackSettings> {
  return parseFallbackSettings(await readSettingsObject(agentDir));
}

export async function saveFallbackSettings(
  agentDir: string,
  settings: FallbackSettings,
): Promise<void> {
  const existing = (await readSettingsObject(agentDir)) ?? {};
  const next = {
    ...existing,
    fallback: {
      chain: settings.chain,
      maxHops: settings.maxHops,
    },
  };
  await writeFile(mcxPaths(agentDir).settings, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function readSettingsObject(agentDir: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw: unknown = JSON.parse(await readFile(mcxPaths(agentDir).settings, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  } catch {
    return undefined;
  }
}

function defaultLoadSettings(): Promise<FallbackSettings> {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  if (!agentDir) return Promise.resolve(emptySettings());
  return loadFallbackSettings(agentDir);
}

function isAssistant(message: { role: string }): message is AssistantLike {
  return message.role === "assistant";
}

function lastAssistant(messages: readonly { role: string }[]): AssistantLike | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && isAssistant(message)) return message;
  }
  return undefined;
}

function failureFromTurn(
  message: AssistantLike,
  lastHttpStatus: number | undefined,
  compactedAlready: boolean,
): ProviderFailure {
  const failure: ProviderFailure = { compactedAlready };
  if (lastHttpStatus !== undefined) failure.httpStatus = lastHttpStatus;
  if (message.errorMessage) failure.message = message.errorMessage;
  return failure;
}

function hopModels(ctx: ExtensionContext): HopCandidate[] {
  return ctx.modelRegistry
    .getAvailable()
    .filter((model) => isCuratedPiProvider(model.provider))
    .map((model) => ({
      provider: model.provider,
      modelId: model.id,
      contextWindow: model.contextWindow,
    }));
}

function needsCrossProviderStrip(
  messages: readonly { role: string; provider?: string }[],
  destProvider: string | undefined,
): boolean {
  if (!destProvider) return false;
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      typeof message.provider === "string" &&
      message.provider !== destProvider,
  );
}

function announceHop(ctx: ExtensionContext, notice: string): void {
  ctx.ui.notify(notice, "warning");
  ctx.ui.setStatus("mcx-fallback", notice);
  ctx.ui.setWorkingMessage(notice);
}

function announceAttention(
  ctx: ExtensionContext,
  failure: ProviderFailure,
  settings: FallbackSettings,
  onAttention: FallbackAttention | undefined,
): void {
  if (isAuthFailure(failure)) {
    ctx.ui.notify("auth failed", "error");
    ctx.ui.setStatus("mcx-fallback", "auth failed");
    onAttention?.("auth");
    return;
  }
  const decision = classifyProviderFailure(failure);
  if (decision.hop && settings.chain.length > 0) {
    ctx.ui.notify("fallback chain exhausted", "error");
    ctx.ui.setStatus("mcx-fallback", "fallback chain exhausted");
    onAttention?.("exhausted");
  }
}

export function registerFallback(
  pi: ExtensionAPI,
  options: {
    loadSettings?: LoadFallbackSettings;
    onAttention?: FallbackAttention;
    selectPacketGate?: SelectPacketGate;
  } = {},
): void {
  const loadSettings = options.loadSettings ?? defaultLoadSettings;
  const state: FallbackState = {
    hopIndex: 0,
    compactedAlready: false,
    lastHttpStatus: undefined,
    pendingStrip: false,
  };

  const resetPrompt = (): void => {
    state.hopIndex = 0;
    state.compactedAlready = false;
    state.lastHttpStatus = undefined;
    state.pendingStrip = false;
  };

  pi.on("session_start", (_event, ctx) => {
    resetPrompt();
    ctx.ui.setStatus("mcx-fallback", undefined);
  });

  pi.on("before_agent_start", () => {
    resetPrompt();
  });

  pi.on("turn_start", () => {
    state.lastHttpStatus = undefined;
  });

  pi.on("after_provider_response", (event) => {
    state.lastHttpStatus = event.status;
  });

  pi.on("session_compact", (event) => {
    if (event.reason === "overflow") state.compactedAlready = true;
  });

  pi.on("context", (event, ctx) => {
    const cross = needsCrossProviderStrip(event.messages, ctx.model?.provider);
    if (!state.pendingStrip && !cross) return;
    state.pendingStrip = false;
    return {
      messages: stripForProvider(event.messages as unknown as RouterMessage[]) as unknown as typeof event.messages,
    };
  });

  pi.on("message_end", async (event, ctx) => {
    const message = event.message;
    if (!isAssistant(message) || message.stopReason !== "error") return;

    const settings = await loadSettings();
    const plan = planHop({
      failure: failureFromTurn(message, state.lastHttpStatus, state.compactedAlready),
      chain: settings.chain,
      maxHops: settings.maxHops,
      hopIndex: state.hopIndex,
      currentProvider: ctx.model?.provider ?? message.provider ?? "",
      currentContextWindow: ctx.model?.contextWindow ?? 0,
      models: hopModels(ctx),
    });
    if (!plan.hop || plan.reason !== "overflow_after_compact") return;

    return {
      message: {
        ...message,
        errorMessage: disguiseOverflowForRetry(message.errorMessage ?? "context overflow"),
      },
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    const assistant = lastAssistant(event.messages);
    if (!assistant) return;
    if (assistant.stopReason !== "error") {
      state.hopIndex = 0;
      ctx.ui.setStatus("mcx-fallback", undefined);
      ctx.ui.setWorkingMessage();
      return;
    }

    const settings = await loadSettings();
    const skip = new Set<string>();
    const currentProvider = ctx.model?.provider ?? assistant.provider ?? "";
    const currentContextWindow = ctx.model?.contextWindow ?? 0;
    const models = hopModels(ctx);
    const failure = failureFromTurn(assistant, state.lastHttpStatus, state.compactedAlready);

    for (;;) {
      const plan = planHop({
        failure,
        chain: settings.chain,
        maxHops: settings.maxHops,
        hopIndex: state.hopIndex,
        currentProvider,
        currentContextWindow,
        models,
        skipProviders: skip,
      });
      if (!plan.hop) {
        announceAttention(ctx, failure, settings, options.onAttention);
        return;
      }

      const model = ctx.modelRegistry.find(plan.to.provider, plan.to.modelId);
      const switched =
        model &&
        (await withoutSelectPacket(options.selectPacketGate, () => pi.setModel(model)));
      if (!model || !switched) {
        skip.add(plan.to.provider);
        continue;
      }

      state.hopIndex += 1;
      state.pendingStrip = true;
      announceHop(ctx, plan.notice);
      return;
    }
  });
}
