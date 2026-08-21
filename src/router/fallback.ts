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

const TIMEOUT_RE = /\b(timeout|timed out|etimedout|deadline exceeded)\b/i;
const OVERLOAD_RE = /\b(overloaded|overload|capacity|too many requests)\b/i;
const OVERFLOW_RE = /\b(context (length|window)|too many tokens|maximum context)\b/i;

export const DEFAULT_MAX_HOPS = 2;

export function classifyProviderFailure(failure: ProviderFailure): FallbackDecision {
  const status = failure.httpStatus;
  const code = (failure.errorCode ?? "").toLowerCase();
  const message = failure.message ?? "";

  if (status === 401 || status === 403 || code === "unauthorized" || code === "forbidden") {
    return { hop: false };
  }

  if (status === 400 || code === "invalid_request" || code === "content_filter") {
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

  if (OVERFLOW_RE.test(message) || code === "context_overflow") {
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

export function nextInChain<T>(chain: readonly T[], currentIndex: number): T | undefined {
  return chain[currentIndex + 1];
}

export function formatHopNotice(input: {
  from: string;
  to: string;
  reason: FallbackReason;
}): string {
  return `retrying on ${input.to} (${input.reason} ${input.from})`;
}
