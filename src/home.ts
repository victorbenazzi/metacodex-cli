import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

export const MCX_HOME_ENV = "MCX_HOME";

export function resolveMcxHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[MCX_HOME_ENV]?.trim();
  if (override) return override;
  return join(homedir(), ".mcx");
}

export function mcxPaths(home = resolveMcxHome()) {
  return {
    home,
    auth: join(home, "auth.json"),
    settings: join(home, "settings.json"),
    models: join(home, "models.json"),
    sessions: join(home, "sessions"),
    subagents: join(home, "sessions", "subagents"),
    skills: join(home, "skills"),
    extensions: join(home, "extensions"),
  };
}

export async function ensureMcxHome(home = resolveMcxHome()): Promise<string> {
  const paths = mcxPaths(home);
  await mkdir(paths.home, { recursive: true });
  await mkdir(paths.sessions, { recursive: true });
  await mkdir(paths.subagents, { recursive: true });
  await mkdir(paths.skills, { recursive: true });
  await mkdir(paths.extensions, { recursive: true });
  return paths.home;
}
