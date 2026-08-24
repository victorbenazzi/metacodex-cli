import { describe, expect, it } from "vitest";
import { formatAuthOption, formatFallbackChain, isFallbackOption, parseAuthOption } from "./auth.js";

describe("auth option rows", () => {
  const anthropic = {
    id: "anthropic",
    piId: "anthropic",
    label: "Anthropic",
    methods: ["oauth" as const, "api_key" as const],
  };

  it("encodes id first so we can round-trip the select label", () => {
    const row = formatAuthOption(anthropic, { configured: false });
    expect(row).toContain("Anthropic");
    expect(row).toContain("not connected");
    expect(parseAuthOption(row)).toBe("anthropic");
  });

  it("marks stored credentials as connected", () => {
    const row = formatAuthOption(anthropic, { configured: true, source: "stored" });
    expect(row).toContain("connected");
    expect(parseAuthOption("not-a-provider  x")).toBeUndefined();
  });

  it("formats the fallback chain and recognizes the fallback row", () => {
    expect(formatFallbackChain([])).toBe("(empty, same-model retry)");
    expect(formatFallbackChain(["anthropic", "deepseek"])).toBe("anthropic, deepseek");
    expect(isFallbackOption("fallback  Fallback chain")).toBe(true);
    expect(isFallbackOption("anthropic  Anthropic")).toBe(false);
  });
});
