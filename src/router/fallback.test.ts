import { describe, expect, it } from "vitest";
import {
  canHop,
  classifyProviderFailure,
  formatHopNotice,
  nextInChain,
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
  });

  it("hops overflow only after compaction", () => {
    expect(
      classifyProviderFailure({
        message: "maximum context length exceeded",
        compactedAlready: false,
      }).hop,
    ).toBe(false);
    expect(
      classifyProviderFailure({
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
    expect(nextInChain(["anthropic", "deepseek"], 0)).toBe("deepseek");
    expect(nextInChain(["anthropic", "deepseek"], 1)).toBeUndefined();
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
