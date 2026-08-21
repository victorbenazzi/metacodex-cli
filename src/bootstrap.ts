import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { curatedEnabledModelPatterns } from "./catalog.js";
import { mcxPaths } from "./home.js";

export function packageRoot(from = import.meta.url): string {
  return fileURLToPath(new URL("..", from));
}

export function bundledSkillPath(root = packageRoot()): string {
  return join(root, "skills", "mcx", "SKILL.md");
}

async function hasStoredAuth(agentDir: string): Promise<boolean> {
  try {
    const raw = await readFile(mcxPaths(agentDir).auth, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0);
  } catch {
    return false;
  }
}

export async function seedMcxSettings(agentDir: string): Promise<void> {
  if (!(await hasStoredAuth(agentDir))) return;

  const settingsPath = mcxPaths(agentDir).settings;
  const patterns = curatedEnabledModelPatterns();
  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      return;
    }
  }

  if (Array.isArray(existing.enabledModels) && existing.enabledModels.length > 0) {
    return;
  }

  const next = {
    ...existing,
    enabledModels: patterns,
  };
  await writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
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
