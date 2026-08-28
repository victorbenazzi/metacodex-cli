import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_SETTING } from "./brand/mark.js";
import {
  DEFAULT_QUIET_STARTUP,
  installBundledKeybindings,
  installBundledSkill,
  installBundledThemes,
  packageRoot,
  seedMcxSettings,
} from "./bootstrap.js";
import { bundledKeybindingsConfig, pasteKeybindingsConfig, THINKING_CYCLE_KEYBINDING } from "./extensions/paste-keys.js";
import { enabledModelPatternsForPiIds } from "./catalog.js";

describe("seedMcxSettings", () => {
  it("seeds the metacodex theme before any stored credential exists", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-seed-"));
    await seedMcxSettings(home);
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      theme?: string;
      enabledModels?: string[];
      quietStartup?: boolean;
    };
    expect(raw.theme).toBe(DEFAULT_THEME_SETTING);
    expect(raw.quietStartup).toBe(DEFAULT_QUIET_STARTUP);
    expect((raw as { warnings?: { anthropicExtraUsage?: boolean } }).warnings?.anthropicExtraUsage).toBe(false);
    expect(raw.enabledModels).toBeUndefined();
  });

  it("scopes enabledModels to stored curated wallets, not the whole table", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-seed-"));
    await writeFile(
      join(home, "auth.json"),
      JSON.stringify({
        anthropic: { type: "api_key", key: "x" },
        deepseek: { type: "api_key", key: "y" },
        openrouter: { type: "api_key", key: "z" },
      }),
    );
    await seedMcxSettings(home);
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      enabledModels: string[];
      theme: string;
    };
    expect(raw.enabledModels).toEqual(enabledModelPatternsForPiIds(["anthropic", "deepseek"]));
    expect(raw.theme).toBe(DEFAULT_THEME_SETTING);
  });

  it("rewrites a leftover full enabledModels list to the wallets that exist", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-seed-"));
    await writeFile(join(home, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "x" } }));
    await writeFile(
      join(home, "settings.json"),
      JSON.stringify({
        theme: "dark",
        enabledModels: ["anthropic/*", "openai/*", "openai-codex/*", "opencode/*", "kimi-coding/*"],
      }),
    );
    await seedMcxSettings(home);
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      enabledModels: string[];
      theme: string;
    };
    expect(raw.enabledModels).toEqual(["anthropic/*"]);
    expect(raw.theme).toBe("dark");
  });

  it("drops enabledModels when no curated credential remains", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-seed-"));
    await writeFile(
      join(home, "settings.json"),
      JSON.stringify({ theme: "dark", enabledModels: ["openai/*"] }),
    );
    await seedMcxSettings(home);
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      enabledModels?: string[];
      theme: string;
    };
    expect(raw.enabledModels).toBeUndefined();
    expect(raw.theme).toBe("dark");
  });

  it("does not turn quietStartup back on after the user disables it", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-seed-quiet-"));
    await writeFile(join(home, "settings.json"), JSON.stringify({ quietStartup: false, theme: "dark" }));
    await seedMcxSettings(home);
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      quietStartup: boolean;
    };
    expect(raw.quietStartup).toBe(false);
  });
});

describe("installBundledSkill", () => {
  it("copies the bundled skill once and leaves user edits alone", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-skill-"));
    await mkdir(join(home, "skills"), { recursive: true });
    const first = await installBundledSkill(home, packageRoot());
    const second = await installBundledSkill(home, packageRoot());
    expect(first).toBe(true);
    expect(second).toBe(false);
    const dest = join(home, "skills", "mcx", "SKILL.md");
    const text = await readFile(dest, "utf8");
    expect(text).toContain("name: mcx");
    await writeFile(dest, "user edit\n");
    await installBundledSkill(home, packageRoot());
    expect(await readFile(dest, "utf8")).toBe("user edit\n");
  });
});

describe("installBundledThemes", () => {
  it("copies both themes once and leaves user edits alone", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-theme-"));
    const first = await installBundledThemes(home, packageRoot());
    const second = await installBundledThemes(home, packageRoot());
    expect(first.sort()).toEqual(["metacodex-dark.json", "metacodex-light.json"]);
    expect(second).toEqual([]);

    const darkPath = join(home, "themes", "metacodex-dark.json");
    const dark = JSON.parse(await readFile(darkPath, "utf8")) as { name: string; colors: { accent: string } };
    expect(dark.name).toBe("metacodex-dark");
    expect(dark.colors.accent).toBe("orange");

    await writeFile(darkPath, "user edit\n");
    await installBundledThemes(home, packageRoot());
    expect(await readFile(darkPath, "utf8")).toBe("user edit\n");
  });
});

describe("installBundledKeybindings", () => {
  it("writes paste keys and unbinds thinking cycle once, and leaves user edits alone", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-keys-"));
    const first = await installBundledKeybindings(home);
    const second = await installBundledKeybindings(home);
    expect(first).toBe(true);
    expect(second).toBe(false);
    const dest = join(home, "keybindings.json");
    expect(JSON.parse(await readFile(dest, "utf8"))).toEqual(bundledKeybindingsConfig());
    await writeFile(dest, "user edit\n");
    await installBundledKeybindings(home);
    expect(await readFile(dest, "utf8")).toBe("user edit\n");
  });

  it("unbinds thinking cycle on existing paste-only keybindings", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-keys-plan-"));
    const dest = join(home, "keybindings.json");
    await writeFile(dest, `${JSON.stringify(pasteKeybindingsConfig(), null, 2)}\n`);
    const patched = await installBundledKeybindings(home);
    expect(patched).toBe(true);
    const raw = JSON.parse(await readFile(dest, "utf8")) as Record<string, unknown>;
    expect(raw[THINKING_CYCLE_KEYBINDING]).toEqual([]);
    expect(raw["app.clipboard.pasteImage"]).toEqual(pasteKeybindingsConfig()["app.clipboard.pasteImage"]);
  });
});
