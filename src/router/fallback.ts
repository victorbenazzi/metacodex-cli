import { findCuratedByPiId, findCuratedProvider } from "../catalog.js";

export type FallbackReason =
  | "rate_limit"
  | "server_error"
  | "timeout"
  | "overload"
  | "overflow_after_compact";

export interface ProviderFailure {
  httpStatus?: number;
  errorCode?: string;
  message?: string;
  compactedAlready?: boolean;
}

export interface FallbackDecision {
  hop: boolean;
  reason?: FallbackReason;
}

export interface FallbackSettings {
  /** Curated Pi provider ids, in hop order. Empty means same-model retry (Pi). */
  chain: string[];
  maxHops: number;
}

export interface HopCandidate {
  provider: string;
  modelId: string;
  contextWindow: number;
}

export interface PlanHopInput {
  failure: ProviderFailure;
  chain: readonly string[];
  maxHops?: number;
  hopIndex: number;
  currentProvider: string;
  currentContextWindow: number;
  models: readonly HopCandidate[];
  skipProviders?: ReadonlySet<string>;
}

export type HopPlan =
  | { hop: false }
  | {
      hop: true;
      reason: FallbackReason;
      to: HopCandidate;
      notice: string;
    };

const TIMEOUT_RE = /\b(timeout|timed out|etimedout|deadline exceeded)\b/i;
const OVERLOAD_RE = /\b(overloaded|overload|capacity|too many requests)\b/i;
const OVERFLOW_RE =
  /prompt is too long|request_too_large|context[_ ]?(length|window)|too many tokens|maximum context|exceeded model token limit|reduce the length of the messages|maximum prompt length|input token count|token limit exceeded/i;

export const DEFAULT_MAX_HOPS = 2;

function isOverflowText(code: string, message: string): boolean {
  return OVERFLOW_RE.test(message) || code === "context_overflow";
}

export function isAuthFailure(failure: ProviderFailure): boolean {
  const status = failure.httpStatus;
  const code = (failure.errorCode ?? "").toLowerCase();
  return status === 401 || status === 403 || code === "unauthorized" || code === "forbidden";
}

export function classifyProviderFailure(failure: ProviderFailure): FallbackDecision {
  const status = failure.httpStatus;
  const code = (failure.errorCode ?? "").toLowerCase();
  const message = failure.message ?? "";
  const overflow = isOverflowText(code, message);

  if (isAuthFailure(failure)) {
    return { hop: false };
  }

  // Overflow often arrives as HTTP 400. Compact first; hop only after that.
  if ((status === 400 || code === "invalid_request" || code === "content_filter") && !overflow) {
    return { hop: false };
  }

  if (status === 429 || code === "rate_limit" || OVERLOAD_RE.test(message)) {
    return { hop: true, reason: status === 429 || code === "rate_limit" ? "rate_limit" : "overload" };
  }

  if (status !== undefined && status >= 500 && status <= 599) {
    return { hop: true, reason: "server_error" };
  }

  if (TIMEOUT_RE.test(message) || code === "timeout") {
    return { hop: true, reason: "timeout" };
  }

  if (overflow) {
    if (failure.compactedAlready) {
      return { hop: true, reason: "overflow_after_compact" };
    }
    return { hop: false };
  }

  return { hop: false };
}

export function canHop(hopIndex: number, maxHops = DEFAULT_MAX_HOPS): boolean {
  return hopIndex < maxHops;
}

export function formatHopNotice(input: {
  from: string;
  to: string;
  reason: FallbackReason;
}): string {
  return `retrying on ${input.to} (${input.reason} ${input.from})`;
}

export function providerLabel(piId: string): string {
  return findCuratedByPiId(piId)?.id ?? piId;
}

function clampMaxHops(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_HOPS;
  return Math.max(0, Math.min(DEFAULT_MAX_HOPS, Math.floor(value)));
}

/** Read `fallback` from a settings.json object. Unknown providers are dropped. */
export function parseFallbackSettings(raw: unknown): FallbackSettings {
  const defaults: FallbackSettings = { chain: [], maxHops: DEFAULT_MAX_HOPS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const fallback = (raw as Record<string, unknown>).fallback;
  if (!fallback || typeof fallback !== "object" || Array.isArray(fallback)) return defaults;

  const rec = fallback as Record<string, unknown>;
  const chain: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(rec.chain)) {
    for (const item of rec.chain) {
      if (typeof item !== "string") continue;
      const curated = findCuratedProvider(item);
      if (!curated || seen.has(curated.piId)) continue;
      seen.add(curated.piId);
      chain.push(curated.piId);
    }
  }
  return { chain, maxHops: clampMaxHops(rec.maxHops) };
}

/**
 * Pi will not auto-retry overflow after one compact. Prefix a rate-limit
 * disguise so the existing retry loop continues after we switch models.
 * This is a contract with the Pi retry loop, not a product rule.
 * The original text is kept for the session log.
 */
export function disguiseOverflowForRetry(errorMessage: string): string {
  if (/rate limit/i.test(errorMessage)) return errorMessage;
  return `rate limit: ${errorMessage}`;
}

function pickModelForProvider(
  models: readonly HopCandidate[],
  piId: string,
  minWindow: number | undefined,
): HopCandidate | undefined {
  const pool = models.filter(
    (model) => model.provider === piId && (minWindow === undefined || model.contextWindow > minWindow),
  );
  if (pool.length === 0) return undefined;
  if (minWindow !== undefined) {
    return pool.reduce((best, model) => (model.contextWindow > best.contextWindow ? model : best));
  }
  return pool[0];
}

export function planHop(input: PlanHopInput): HopPlan {
  const decision = classifyProviderFailure(input.failure);
  if (!decision.hop || !decision.reason) return { hop: false };
  const maxHops = input.maxHops ?? DEFAULT_MAX_HOPS;
  if (!canHop(input.hopIndex, maxHops)) return { hop: false };
  if (input.chain.length === 0) return { hop: false };

  const currentIndex = input.chain.indexOf(input.currentProvider);
  const minWindow =
    decision.reason === "overflow_after_compact" ? input.currentContextWindow : undefined;

  for (let i = currentIndex + 1; i < input.chain.length; i++) {
    const piId = input.chain[i];
    if (!piId || piId === input.currentProvider) continue;
    if (input.skipProviders?.has(piId)) continue;
    const to = pickModelForProvider(input.models, piId, minWindow);
    if (!to) continue;
    return {
      hop: true,
      reason: decision.reason,
      to,
      notice: formatHopNotice({
        from: providerLabel(input.currentProvider),
        to: providerLabel(to.provider),
        reason: decision.reason,
      }),
    };
  }
  return { hop: false };
}
