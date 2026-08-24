import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extraSkillDirs, extraSkillPaths, projectSkillRoots } from "./discovery.js";

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeSkill(dir: string, name: string, frontmatterName = name): Promise<void> {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${frontmatterName}\ndescription: test\n---\n`);
}

describe("projectSkillRoots", () => {
  it("stops at the git root and otherwise stays on cwd", async () => {
    const repo = await tempDir("mcx-skills-repo-");
    const nested = join(repo, "packages", "app");
    await mkdir(nested, { recursive: true });
    await writeFile(join(repo, ".git"), "gitdir: /tmp/fake\n");

    expect(projectSkillRoots(nested)).toEqual([nested, join(repo, "packages"), repo]);

    const loose = await tempDir("mcx-skills-loose-");
    expect(projectSkillRoots(loose)).toEqual([loose]);
  });
});

describe("extraSkillDirs", () => {
  it("returns only directories that exist, never invents missing Claude or Codex paths", async () => {
    const home = await tempDir("mcx-skills-home-");
    const cwd = await tempDir("mcx-skills-cwd-");
    expect(extraSkillDirs(cwd, home)).toEqual([]);
  });

  it("unions home Claude/Codex skills with repo .claude/skills", async () => {
    const home = await tempDir("mcx-skills-home-");
    const repo = await tempDir("mcx-skills-git-");
    await writeFile(join(repo, ".git"), "gitdir: /tmp/fake\n");
    const claudeHome = join(home, ".claude", "skills");
    const codexHome = join(home, ".codex", "skills");
    const claudeRepo = join(repo, ".claude", "skills");
    await mkdir(claudeHome, { recursive: true });
    await mkdir(codexHome, { recursive: true });
    await mkdir(claudeRepo, { recursive: true });

    expect(extraSkillDirs(repo, home)).toEqual([claudeHome, codexHome, claudeRepo]);
  });
});

describe("extraSkillPaths", () => {
  it("skips Claude skills that already exist in ~/.agents/skills", async () => {
    const home = await tempDir("mcx-skills-dedupe-home-");
    const cwd = await tempDir("mcx-skills-dedupe-cwd-");
    const agentDir = await tempDir("mcx-skills-dedupe-agent-");
    await writeSkill(join(home, ".agents", "skills"), "geo");
    await writeSkill(join(home, ".claude", "skills"), "geo");
    await writeSkill(join(home, ".claude", "skills"), "only-claude");

    expect(extraSkillPaths(cwd, home, agentDir)).toEqual([join(home, ".claude", "skills", "only-claude")]);
  });

  it("returns nothing when every extra name is already loaded", async () => {
    const home = await tempDir("mcx-skills-alldup-home-");
    const cwd = await tempDir("mcx-skills-alldup-cwd-");
    const agentDir = await tempDir("mcx-skills-alldup-agent-");
    await writeSkill(join(home, ".agents", "skills"), "geo");
    await writeSkill(join(home, ".claude", "skills"), "geo");

    expect(extraSkillPaths(cwd, home, agentDir)).toEqual([]);
  });
});
