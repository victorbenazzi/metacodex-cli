import { describe, expect, it } from "vitest";
import {
  CURATED_PROVIDERS,
  curatedEnabledModelPatterns,
  curatedModelsOnly,
  curatedSessionModels,
  enabledModelPatternsForPiIds,
  findCuratedProvider,
  isCuratedPiProvider,
  parseProviderModel,
  providersForUi,
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

  it("sorts pickers by label and keeps the grill table order for defaults", () => {
    expect(providersForUi().map((p) => p.label)).toEqual([
      "Anthropic",
      "DeepSeek",
      "Kimi",
      "OpenAI API",
      "OpenAI Codex",
      "OpenCode Go",
      "OpenCode Zen",
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

describe("parseProviderModel", () => {
  it("reads provider/id from a picker row or a raw key", () => {
    expect(parseProviderModel("deepseek/deepseek-chat  DeepSeek Chat")).toEqual({
      provider: "deepseek",
      id: "deepseek-chat",
    });
    expect(parseProviderModel("not-a-model")).toBeUndefined();
  });
});

describe("curatedSessionModels", () => {
  it("prefers scoped models and drops uncurated providers", () => {
    expect(
      curatedSessionModels({
        scoped: [],
        available: [
          { provider: "anthropic", id: "opus" },
          { provider: "google", id: "gemini" },
        ],
      }),
    ).toEqual([{ provider: "anthropic", id: "opus" }]);
    expect(
      curatedSessionModels({
        scoped: [{ model: { provider: "deepseek", id: "deepseek-chat" } }],
        available: [{ provider: "anthropic", id: "opus" }],
      }),
    ).toEqual([{ provider: "deepseek", id: "deepseek-chat" }]);
  });
});

