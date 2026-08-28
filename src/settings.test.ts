import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadFallbackSettings,
  loadLastUsedModels,
  parseLastUsedModels,
  readSettings,
  recordLastUsedModel,
  saveFallbackSettings,
} from "./settings.js";

describe("readSettings", () => {
  it("treats a missing file as empty and refuses to parse garbage", async () => {
    const missing = await mkdtemp(join(tmpdir(), "mcx-settings-miss-"));
    expect(await readSettings(missing)).toEqual({});

    const broken = await mkdtemp(join(tmpdir(), "mcx-settings-bad-"));
    await writeFile(join(broken, "settings.json"), "{not json");
    expect(await readSettings(broken)).toBeUndefined();
  });
});

describe("fallback settings", () => {
  it("reads fallback.chain from settings.json", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-fallback-"));
    await writeFile(
      join(home, "settings.json"),
      JSON.stringify({ fallback: { chain: ["anthropic", "deepseek"], maxHops: 1 } }),
    );
    expect(await loadFallbackSettings(home)).toEqual({
      chain: ["anthropic", "deepseek"],
      maxHops: 1,
    });
  });

  it("merges fallback into existing settings without dropping enabledModels", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-fallback-save-"));
    await writeFile(join(home, "settings.json"), JSON.stringify({ enabledModels: ["anthropic/*"] }));
    await saveFallbackSettings(home, { chain: ["deepseek", "kimi-coding"], maxHops: 2 });
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      enabledModels: string[];
      fallback: { chain: string[]; maxHops: number };
    };
    expect(raw.enabledModels).toEqual(["anthropic/*"]);
    expect(raw.fallback).toEqual({ chain: ["deepseek", "kimi-coding"], maxHops: 2 });
  });

  it("does not overwrite a corrupt settings file", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-fallback-corrupt-"));
    const path = join(home, "settings.json");
    await writeFile(path, "{not json");
    await saveFallbackSettings(home, { chain: ["deepseek"], maxHops: 2 });
    expect(await readFile(path, "utf8")).toBe("{not json");
  });
});

describe("lastUsedModels", () => {
  it("keeps curated providers only and records last-used without touching defaultModel", async () => {
    expect(
      parseLastUsedModels({
        lastUsedModels: {
          anthropic: "opus",
          openrouter: "hidden",
          deepseek: "  deepseek-chat  ",
          "": "x",
        },
      }),
    ).toEqual({ anthropic: "opus", deepseek: "deepseek-chat" });
    expect(parseLastUsedModels(undefined)).toEqual({});

    const home = await mkdtemp(join(tmpdir(), "mcx-last-used-"));
    await writeFile(join(home, "settings.json"), JSON.stringify({ enabledModels: ["anthropic/*"] }));
    await recordLastUsedModel(home, { provider: "deepseek", id: "deepseek-reasoner" });
    await recordLastUsedModel(home, { provider: "openrouter", id: "hidden" });
    expect(await loadLastUsedModels(home)).toEqual({ deepseek: "deepseek-reasoner" });
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      enabledModels: string[];
      lastUsedModels: Record<string, string>;
    };
    expect(raw.enabledModels).toEqual(["anthropic/*"]);
    expect(raw.lastUsedModels).toEqual({ deepseek: "deepseek-reasoner" });
    expect("defaultModel" in raw).toBe(false);
  });
});
