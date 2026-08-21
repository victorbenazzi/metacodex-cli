import { describe, expect, it } from "vitest";
import {
  CURATED_PROVIDERS,
  isCuratedPiProvider,
} from "./catalog.js";

describe("catalog", () => {
  it("is the v1 wallet list, nothing else", () => {
    expect(CURATED_PROVIDERS.map((p) => p.piId)).toEqual([
      "anthropic",
      "openai",
      "openai-codex",
      "opencode",
      "opencode-go",
      "deepseek",
      "kimi-coding",
    ]);
  });

  it("hides the rest of the Pi catalog", () => {
    expect(isCuratedPiProvider("openrouter")).toBe(false);
    expect(isCuratedPiProvider("google")).toBe(false);
    expect(isCuratedPiProvider("anthropic")).toBe(true);
  });
});
