import { describe, expect, it } from "vitest";
import {
  CURATED_PROVIDERS,
  curatedEnabledModelPatterns,
  curatedModelsOnly,
  enabledModelPatternsForPiIds,
  findCuratedProvider,
  isCuratedPiProvider,
  storedCuratedPiIds,
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

describe("curatedModelsOnly", () => {
  it("is the visibility filter for /model and fallback", () => {
    expect(
      curatedModelsOnly([
        { provider: "anthropic", id: "opus" },
        { provider: "google", id: "gemini" },
      ]),
    ).toEqual([{ provider: "anthropic", id: "opus" }]);
  });
});

describe("findCuratedProvider", () => {
  it("matches id, pi id, and label", () => {
    expect(findCuratedProvider("kimi")?.piId).toBe("kimi-coding");
    expect(findCuratedProvider("OpenCode Zen")?.id).toBe("opencode-zen");
    expect(curatedEnabledModelPatterns()).toContain("openai-codex/*");
  });
});

describe("enabledModelPatternsForPiIds", () => {
  it("keeps catalog order and ignores unknown wallets", () => {
    expect(enabledModelPatternsForPiIds(["deepseek", "openrouter", "anthropic"])).toEqual([
      "anthropic/*",
      "deepseek/*",
    ]);
    expect(storedCuratedPiIds({ anthropic: {}, openrouter: {} })).toEqual(["anthropic"]);
  });
});

