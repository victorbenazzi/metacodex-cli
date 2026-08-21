import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installBundledSkill, packageRoot, seedMcxSettings } from "./bootstrap.js";
import { curatedEnabledModelPatterns } from "./catalog.js";

describe("seedMcxSettings", () => {
  it("does not write enabledModels before any stored credential exists", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-seed-"));
    await seedMcxSettings(home);
    await expect(readFile(join(home, "settings.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("writes curated enabledModels once a credential is stored", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-seed-"));
    await writeFile(join(home, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "x" } }));
    await seedMcxSettings(home);
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      enabledModels: string[];
    };
    expect(raw.enabledModels).toEqual(curatedEnabledModelPatterns());
  });

  it("does not overwrite an existing enabledModels list", async () => {
    const home = await mkdtemp(join(tmpdir(), "mcx-seed-"));
    await writeFile(
      join(home, "settings.json"),
      JSON.stringify({ enabledModels: ["anthropic/*"] }),
    );
    await seedMcxSettings(home);
    const raw = JSON.parse(await readFile(join(home, "settings.json"), "utf8")) as {
      enabledModels: string[];
    };
    expect(raw.enabledModels).toEqual(["anthropic/*"]);
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
