import { readFile, writeFile } from "node:fs/promises";
import { mcxPaths } from "./home.js";
import { parseFallbackSettings, type FallbackSettings } from "./router/fallback.js";

/** Pi settings.json plus our keys. Unknown keys are preserved on write. */
export type SettingsObject = Record<string, unknown>;

/**
 * Missing file is `{}`. Unreadable or invalid JSON is `undefined` (do not overwrite).
 */
export async function readSettings(agentDir: string): Promise<SettingsObject | undefined> {
  try {
    const raw: unknown = JSON.parse(await readFile(mcxPaths(agentDir).settings, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as SettingsObject;
    }
    return {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    return undefined;
  }
}

export async function writeSettings(agentDir: string, next: SettingsObject): Promise<void> {
  await writeFile(mcxPaths(agentDir).settings, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function loadFallbackSettings(agentDir: string): Promise<FallbackSettings> {
  return parseFallbackSettings(await readSettings(agentDir));
}

export async function saveFallbackSettings(
  agentDir: string,
  settings: FallbackSettings,
): Promise<void> {
  const existing = await readSettings(agentDir);
  if (!existing) return;
  await writeSettings(agentDir, {
    ...existing,
    fallback: {
      chain: settings.chain,
      maxHops: settings.maxHops,
    },
  });
}
