import { readFile, writeFile } from "node:fs/promises";
import { isCuratedPiProvider } from "./catalog.js";
import { mcxPaths } from "./home.js";
import { parseFallbackSettings, type FallbackSettings } from "./router/fallback.js";

/** Pi settings.json plus our keys. Unknown keys are preserved on write. */
export type SettingsObject = Record<string, unknown>;

/** Last model the user (or a hop) stuck on, keyed by Pi provider id. */
export type LastUsedModels = Record<string, string>;

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

/** Read `lastUsedModels` from a settings.json object. Unknown providers are dropped. */
export function parseLastUsedModels(raw: unknown): LastUsedModels {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const rec = (raw as Record<string, unknown>).lastUsedModels;
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return {};
  const out: LastUsedModels = {};
  for (const [provider, modelId] of Object.entries(rec as Record<string, unknown>)) {
    if (!isCuratedPiProvider(provider) || typeof modelId !== "string") continue;
    const id = modelId.trim();
    if (!id) continue;
    out[provider] = id;
  }
  return out;
}

export async function loadLastUsedModels(agentDir: string): Promise<LastUsedModels> {
  return parseLastUsedModels(await readSettings(agentDir));
}

/**
 * Persist last-used for a curated provider. Pi already writes defaultModel
 * on setModel. Missing or corrupt settings are skipped.
 */
export async function recordLastUsedModel(
  agentDir: string,
  model: { provider: string; id: string },
): Promise<void> {
  if (!isCuratedPiProvider(model.provider)) return;
  const id = model.id.trim();
  if (!id) return;
  const existing = await readSettings(agentDir);
  if (!existing) return;
  try {
    await writeSettings(agentDir, {
      ...existing,
      lastUsedModels: { ...parseLastUsedModels(existing), [model.provider]: id },
    });
  } catch {
    // Home may not exist yet (tests, early boot). Skip rather than throw.
  }
}
