import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

/**
 * Extra skill directories the parent loads read-only.
 * Pi already has `~/.mcx/skills`, `.agents/skills`, and AGENTS.md.
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
