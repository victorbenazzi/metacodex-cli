import { describe, expect, it } from "vitest";
import {
  canHop,
  classifyProviderFailure,
  disguiseOverflowForRetry,
  formatHopNotice,
  isAuthFailure,
  parseFallbackSettings,
  planHop,
} from "./fallback.js";

describe("classifyProviderFailure", () => {
  it("hops on 429, 5xx, timeout, overload", () => {
    expect(classifyProviderFailure({ httpStatus: 429 }).hop).toBe(true);
    expect(classifyProviderFailure({ httpStatus: 503 }).reason).toBe("server_error");
    expect(classifyProviderFailure({ message: "connect timeout" }).reason).toBe("timeout");
    expect(classifyProviderFailure({ message: "overloaded, try later" }).reason).toBe("overload");
  });

  it("does not hop on auth or bad request", () => {
    expect(classifyProviderFailure({ httpStatus: 401 })).toEqual({ hop: false });
    expect(classifyProviderFailure({ httpStatus: 403 })).toEqual({ hop: false });
    expect(classifyProviderFailure({ httpStatus: 400 })).toEqual({ hop: false });
    expect(isAuthFailure({ httpStatus: 401 })).toBe(true);
    expect(isAuthFailure({ httpStatus: 400 })).toBe(false);
  });

  it("hops overflow only after compaction, even when the HTTP status is 400", () => {
    expect(
      classifyProviderFailure({
        message: "prompt is too long: 213462 tokens > 200000 maximum",
        compactedAlready: false,
      }).hop,
    ).toBe(false);
    expect(
      classifyProviderFailure({
        message: "prompt is too long: 213462 tokens > 200000 maximum",
        compactedAlready: true,
      }).reason,
    ).toBe("overflow_after_compact");
    expect(
      classifyProviderFailure({
        message: "Your request exceeded model token limit: 256000 (requested: 310000)",
        compactedAlready: true,
      }).reason,
    ).toBe("overflow_after_compact");
    expect(
      classifyProviderFailure({
        message: "maximum context length exceeded",
        compactedAlready: false,
      }).hop,
    ).toBe(false);
    expect(
      classifyProviderFailure({
        message: disguiseOverflowForRetry("prompt is too long: 213462 tokens > 200000 maximum"),
        compactedAlready: true,
      }).reason,
    ).toBe("overflow_after_compact");
    expect(
      classifyProviderFailure({
        httpStatus: 400,
        message: "maximum context length exceeded",
        compactedAlready: true,
      }).reason,
    ).toBe("overflow_after_compact");
  });
});

describe("chain", () => {
  it("caps at 2 hops and walks the explicit list", () => {
    expect(canHop(0)).toBe(true);
    expect(canHop(1)).toBe(true);
    expect(canHop(2)).toBe(false);
  });

  it("formats a visible TUI notice", () => {
    expect(
      formatHopNotice({
        from: "anthropic",
        to: "deepseek",
        reason: "rate_limit",
      }),
    ).toBe("retrying on deepseek (rate_limit anthropic)");
  });
});

describe("parseFallbackSettings", () => {
  it("defaults to an empty chain (Pi same-model retry)", () => {
    expect(parseFallbackSettings(undefined)).toEqual({ chain: [], maxHops: 2 });
    expect(parseFallbackSettings({ enabledModels: ["anthropic/*"] })).toEqual({
      chain: [],
      maxHops: 2,
    });
  });

  it("keeps curated providers only, resolves aliases, clamps hops", () => {
    expect(
      parseFallbackSettings({
        fallback: {
          chain: ["Anthropic", "kimi", "openrouter", "kimi-coding", "deepseek"],
          maxHops: 9,
        },
      }),
    ).toEqual({
      chain: ["anthropic", "kimi-coding", "deepseek"],
      maxHops: 2,
    });
  });
});

describe("planHop", () => {
  const models = [
    { provider: "anthropic", modelId: "opus", contextWindow: 200_000 },
    { provider: "deepseek", modelId: "deepseek-chat", contextWindow: 64_000 },
    { provider: "kimi-coding", modelId: "kimi-k2", contextWindow: 256_000 },
  ];

  it("does not hop when the chain is empty", () => {
    expect(
      planHop({
        failure: { httpStatus: 429 },
        chain: [],
        hopIndex: 0,
        currentProvider: "anthropic",
        currentContextWindow: 200_000,
        models,
      }),
    ).toEqual({ hop: false });
  });

  it("walks the explicit chain and formats the TUI notice", () => {
    expect(
      planHop({
        failure: { httpStatus: 429 },
        chain: ["anthropic", "deepseek", "kimi-coding"],
        hopIndex: 0,
        currentProvider: "anthropic",
        currentContextWindow: 200_000,
        models,
      }),
    ).toEqual({
      hop: true,
      reason: "rate_limit",
      to: { provider: "deepseek", modelId: "deepseek-chat", contextWindow: 64_000 },
      notice: "retrying on deepseek (rate_limit anthropic)",
    });
  });

  it("caps at max hops and skips a destination that is not authenticated", () => {
    expect(
      planHop({
        failure: { httpStatus: 503 },
        chain: ["anthropic", "deepseek", "kimi-coding"],
        hopIndex: 2,
        currentProvider: "deepseek",
        currentContextWindow: 64_000,
        models,
      }).hop,
    ).toBe(false);

    const skipped = planHop({
      failure: { httpStatus: 503 },
      chain: ["anthropic", "deepseek", "kimi-coding"],
      hopIndex: 0,
      currentProvider: "anthropic",
      currentContextWindow: 200_000,
      models: [models[0]!, models[2]!],
    });
    expect(skipped.hop).toBe(true);
    if (skipped.hop) {
      expect(skipped.to).toEqual({
        provider: "kimi-coding",
        modelId: "kimi-k2",
        contextWindow: 256_000,
      });
    }
  });

  it("hops overflow only to a later chain model with a larger window", () => {
    const planned = planHop({
      failure: { message: "maximum context length exceeded", compactedAlready: true },
      chain: ["anthropic", "deepseek", "kimi-coding"],
      hopIndex: 0,
      currentProvider: "anthropic",
      currentContextWindow: 200_000,
      models,
    });
    expect(planned.hop).toBe(true);
    if (planned.hop) {
      expect(planned.to).toEqual({
        provider: "kimi-coding",
        modelId: "kimi-k2",
        contextWindow: 256_000,
      });
    }
  });
});

describe("disguiseOverflowForRetry", () => {
  it("prefixes rate limit so Pi retries without treating it as overflow", () => {
    const disguised = disguiseOverflowForRetry("maximum context length exceeded");
    expect(disguised.startsWith("rate limit:")).toBe(true);
    expect(disguised).toContain("maximum context length exceeded");
  });
});
