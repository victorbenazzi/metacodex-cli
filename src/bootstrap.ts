import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_THEME_SETTING } from "./brand/mark.js";
import { enabledModelPatternsForPiIds, storedCuratedPiIds } from "./catalog.js";
import { pasteKeybindingsConfig } from "./extensions/paste-keys.js";
import { mcxPaths } from "./home.js";

export const DEFAULT_QUIET_STARTUP = true;

export function packageRoot(from = import.meta.url): string {
  return fileURLToPath(new URL("..", from));
}

export function bundledSkillPath(root = packageRoot()): string {
  return join(root, "skills", "mcx", "SKILL.md");
}

export function bundledThemesDir(root = packageRoot()): string {
  return join(root, "themes");
}

async function readAuthObject(agentDir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(mcxPaths(agentDir).auth, "utf8"));
  } catch {
    return undefined;
  }
}

function sameStringList(left: unknown, right: readonly string[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

async function readSettingsObject(agentDir: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(mcxPaths(agentDir).settings, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    return undefined;
  }
}

export async function seedMcxSettings(agentDir: string): Promise<void> {
  const existing = await readSettingsObject(agentDir);
  if (!existing) return;

  const next: Record<string, unknown> = { ...existing };
  let changed = false;

  const theme = existing.theme;
  if (typeof theme !== "string" || !theme.trim()) {
    next.theme = DEFAULT_THEME_SETTING;
    changed = true;
  }

  if (typeof existing.quietStartup !== "boolean") {
    next.quietStartup = DEFAULT_QUIET_STARTUP;
    changed = true;
  }

  const warnings = existing.warnings;
  if (!warnings || typeof warnings !== "object" || Array.isArray(warnings)) {
    next.warnings = { anthropicExtraUsage: false };
    changed = true;
  } else if (!("anthropicExtraUsage" in (warnings as Record<string, unknown>))) {
    next.warnings = { ...warnings, anthropicExtraUsage: false };
    changed = true;
  }

  const connectedPatterns = enabledModelPatternsForPiIds(storedCuratedPiIds(await readAuthObject(agentDir)));
  if (connectedPatterns.length > 0) {
    if (!sameStringList(existing.enabledModels, connectedPatterns)) {
      next.enabledModels = connectedPatterns;
      changed = true;
    }
  } else if (existing.enabledModels !== undefined) {
    delete next.enabledModels;
    changed = true;
  }

  if (!changed) return;
  await writeFile(mcxPaths(agentDir).settings, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function installBundledSkill(agentDir: string, root = packageRoot()): Promise<boolean> {
  const source = bundledSkillPath(root);
  const dest = join(mcxPaths(agentDir).skills, "mcx", "SKILL.md");
  try {
    await readFile(dest);
    return false;
  } catch {
    // missing: install
  }
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(source, dest);
  return true;
}

export async function installBundledThemes(
  agentDir: string,
  root = packageRoot(),
): Promise<string[]> {
  const sourceDir = bundledThemesDir(root);
  const destDir = mcxPaths(agentDir).themes;
  await mkdir(destDir, { recursive: true });

  let names: string[] = [];
  try {
    names = (await readdir(sourceDir)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }

  const installed: string[] = [];
  for (const name of names) {
    const dest = join(destDir, name);
    try {
      await readFile(dest);
      continue;
    } catch {
      // missing: install
    }
    await copyFile(join(sourceDir, name), dest);
    installed.push(name);
  }
  return installed;
}

export async function installBundledKeybindings(agentDir: string): Promise<boolean> {
  const dest = join(mcxPaths(agentDir).home, "keybindings.json");
  try {
    await readFile(dest);
    return false;
  } catch {
    // missing: install
  }
  await writeFile(dest, `${JSON.stringify(pasteKeybindingsConfig(), null, 2)}\n`, "utf8");
  return true;
}
