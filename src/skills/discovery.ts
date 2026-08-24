import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { resolveMcxHome } from "../home.js";

function isExistingDir(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Project roots that may carry `.claude/skills`.
 * Walk cwd toward the git root. If there is no git metadata, only cwd.
 */
export function projectSkillRoots(cwd: string): string[] {
  const chain: string[] = [];
  let current = cwd;
  for (;;) {
    chain.push(current);
    if (existsSync(join(current, ".git"))) return chain;
    const parent = dirname(current);
    if (parent === current) return [cwd];
    current = parent;
  }
}

function skillNameFromFile(skillMd: string, fallback: string): string {
  try {
    const text = readFileSync(skillMd, "utf8");
    const fence = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const name = fence?.[1]?.match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m);
    const trimmed = name?.[1]?.trim();
    return trimmed || fallback;
  } catch {
    return fallback;
  }
}

/** SKILL.md dirs under root. Stops at the first SKILL.md, same as Pi. */
export function collectSkills(root: string): { name: string; dir: string }[] {
  if (!isExistingDir(root)) return [];
  const out: { name: string; dir: string }[] = [];

  const walk = (dir: string): void => {
    const skillMd = join(dir, "SKILL.md");
    if (existsSync(skillMd)) {
      try {
        if (statSync(skillMd).isFile()) {
          out.push({ name: skillNameFromFile(skillMd, basename(dir)), dir });
          return;
        }
      } catch {
        return;
      }
    }
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const child = join(dir, name);
      if (isExistingDir(child)) walk(child);
    }
  };

  walk(root);
  return out;
}

function defaultSkillRoots(cwd: string, home: string, agentDir: string): string[] {
  const roots = [join(agentDir, "skills"), join(home, ".agents", "skills")];
  for (const project of projectSkillRoots(cwd)) {
    roots.push(join(project, ".agents", "skills"));
  }
  return roots;
}

/**
 * Extra skill directories the parent may load read-only.
 * Pi already has `~/.mcx/skills`, `~/.agents/skills`, and project `.agents/skills`.
 * We add Claude and Codex locations. Never write to them.
 */
export function extraSkillDirs(cwd: string, home = homedir()): string[] {
  const out: string[] = [];
  const add = (path: string): void => {
    if (!isExistingDir(path) || out.includes(path)) return;
    out.push(path);
  };

  add(join(home, ".claude", "skills"));
  add(join(home, ".codex", "skills"));
  for (const root of projectSkillRoots(cwd)) {
    add(join(root, ".claude", "skills"));
  }
  return out;
}

/**
 * Extra skill paths that do not collide with names Pi already loads.
 * Injecting a whole ~/.claude/skills dump prints a wall of collisions
 * when the same names live in ~/.agents/skills.
 */
export function extraSkillPaths(
  cwd: string,
  home = homedir(),
  agentDir = resolveMcxHome(),
): string[] {
  const taken = new Set<string>();
  for (const root of defaultSkillRoots(cwd, home, agentDir)) {
    for (const skill of collectSkills(root)) taken.add(skill.name);
  }

  const paths: string[] = [];
  for (const dir of extraSkillDirs(cwd, home)) {
    for (const skill of collectSkills(dir)) {
      if (taken.has(skill.name)) continue;
      taken.add(skill.name);
      if (!paths.includes(skill.dir)) paths.push(skill.dir);
    }
  }
  return paths;
}
