import { describe, expect, it } from "vitest";
import { providersForUi } from "./catalog.js";
import {
  formatAuthRows,
  formatModelRows,
  formatProviderPickRows,
  parseModelId,
  parseModelRow,
  parseProviderPickRow,
  providersInModels,
  sortModelsForPicker,
} from "./picker.js";

function model(provider: string, id: string, name = id) {
  return { provider, id, name };
}

describe("parseModelId", () => {
  it("keeps dated snapshots off the version tuple so latest aliases sort first", () => {
    expect(parseModelId("claude-opus-4-5")).toMatchObject({
      family: "opus",
      version: [4, 5],
      date: undefined,
    });
    expect(parseModelId("claude-opus-4-5-20251101")).toMatchObject({
      family: "opus",
      version: [4, 5],
      date: "20251101",
    });
  });
});

describe("sortModelsForPicker", () => {
  it("lists Anthropic families by capability, newest undated first", () => {
    const sorted = sortModelsForPicker([
      model("anthropic", "claude-haiku-4-5", "Claude Haiku 4.5 (latest)"),
      model("anthropic", "claude-haiku-4-5-20251001", "Claude Haiku 4.5"),
      model("anthropic", "claude-opus-4-5", "Claude Opus 4.5 (latest)"),
      model("anthropic", "claude-opus-4-5-20251101", "Claude Opus 4.5"),
      model("anthropic", "claude-opus-4-6", "Claude Opus 4.6"),
      model("anthropic", "claude-opus-4-7", "Claude Opus 4.7"),
      model("anthropic", "claude-opus-4-8", "Claude Opus 4.8"),
      model("anthropic", "claude-opus-5", "Claude Opus 5"),
      model("anthropic", "claude-fable-5", "Claude Fable 5"),
      model("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5 (latest)"),
      model("anthropic", "claude-sonnet-4-5-20250929", "Claude Sonnet 4.5"),
      model("anthropic", "claude-sonnet-4-6", "Claude Sonnet 4.6"),
      model("anthropic", "claude-sonnet-5", "Claude Sonnet 5"),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      "claude-fable-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-opus-4-5-20251101",
      "claude-sonnet-5",
      "claude-sonnet-4-6",
      "claude-sonnet-4-5",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5",
      "claude-haiku-4-5-20251001",
    ]);
  });

  it("groups OpenCode families alphabetically, newest and pro/max first inside each", () => {
    const sorted = sortModelsForPicker([
      model("opencode-go", "minimax-m3", "MiniMax-M3"),
      model("opencode-go", "qwen3.7-max", "Qwen3.7 Max"),
      model("opencode-go", "qwen3.7-plus", "Qwen3.7 Plus"),
      model("opencode-go", "qwen3.8-max", "Qwen3.8 Max"),
      model("opencode-go", "deepseek-v4-flash", "DeepSeek V4 Flash"),
      model("opencode-go", "deepseek-v4-pro", "DeepSeek V4 Pro"),
      model("opencode-go", "glm-5.1", "GLM-5.1"),
      model("opencode-go", "glm-5.2", "GLM-5.2"),
      model("opencode-go", "glm-5.3", "GLM-5.3"),
      model("opencode-go", "hy3", "Hy3"),
      model("opencode-go", "kimi-k2.6", "Kimi K2.6"),
      model("opencode-go", "kimi-k2.7-code", "Kimi K2.7 Code"),
      model("opencode-go", "kimi-k3", "Kimi K3"),
      model("opencode-go", "mimo-v2.5", "MiMo V2.5"),
      model("opencode-go", "mimo-v2.5-pro", "MiMo V2.5 Pro"),
      model("opencode-go", "minimax-m2.7", "MiniMax-M2.7"),
      model("opencode-go", "qwen3.6-plus", "Qwen3.6 Plus"),
      model("opencode-go", "gpt-5.6-luna", "GPT-5.6 Luna"),
      model("opencode-go", "grok-4.5", "Grok 4.5"),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "glm-5.3",
      "glm-5.2",
      "glm-5.1",
      "gpt-5.6-luna",
      "grok-4.5",
      "hy3",
      "kimi-k3",
      "kimi-k2.7-code",
      "kimi-k2.6",
      "mimo-v2.5-pro",
      "mimo-v2.5",
      "minimax-m3",
      "minimax-m2.7",
      "qwen3.8-max",
      "qwen3.7-max",
      "qwen3.7-plus",
      "qwen3.6-plus",
    ]);
  });

  it("orders providers by label, Anthropic before OpenCode Go", () => {
    const sorted = sortModelsForPicker([
      model("opencode-go", "hy3", "Hy3"),
      model("anthropic", "claude-sonnet-5", "Claude Sonnet 5"),
      model("deepseek", "deepseek-chat", "DeepSeek Chat"),
    ]);
    expect(sorted.map((item) => item.provider)).toEqual(["anthropic", "deepseek", "opencode-go"]);
  });
});

describe("two-step picker rows", () => {
  it("lists providers by label, then short model ids that round-trip", () => {
    const models = [
      model("opencode-go", "hy3", "Hy3"),
      model("anthropic", "claude-opus-5", "Claude Opus 5"),
      model("anthropic", "claude-sonnet-5", "Claude Sonnet 5"),
    ];
    expect(providersInModels(models).map((row) => row.piId)).toEqual(["anthropic", "opencode-go"]);
    expect(formatProviderPickRows(providersInModels(models))).toEqual(["Anthropic", "OpenCode Go"]);
    expect(parseProviderPickRow("Anthropic", providersInModels(models))).toBe("anthropic");

    const anthropic = models.filter((item) => item.provider === "anthropic");
    const rows = formatModelRows(anthropic, { provider: "anthropic", id: "claude-opus-5" });
    expect(rows[0]).toBe("Claude Opus 5  (current)");
    expect(rows[0]).not.toContain("claude-opus-5");
    expect(parseModelRow(rows[0] ?? "", "anthropic", anthropic)).toEqual({
      provider: "anthropic",
      id: "claude-opus-5",
    });
    expect(rows.some((row) => row === "Claude Sonnet 5")).toBe(true);
  });
});

describe("formatAuthRows", () => {
  it("aligns columns, drops brackets, and keeps id first", () => {
    const rows = formatAuthRows(providersForUi(), (piId) => ({
      configured: piId === "anthropic",
      source: "stored",
    }));
    expect(rows[0]?.startsWith("anthropic")).toBe(true);
    expect(rows[0]).toContain("Anthropic");
    expect(rows[0]).toContain("oauth, api_key");
    expect(rows[0]).not.toContain("[oauth");
    expect(rows[0]).toContain("connected");
    expect(rows.map((row) => row.trim().split(/\s+/u)[0])).toEqual([
      "anthropic",
      "deepseek",
      "kimi",
      "openai",
      "openai-codex",
      "opencode-go",
      "opencode-zen",
    ]);
  });
});
