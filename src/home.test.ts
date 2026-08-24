import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { MCX_HOME_ENV, mcxPaths, resolveMcxHome } from "./home.js";

describe("resolveMcxHome", () => {
  it("defaults to ~/.mcx and ignores METACODEX_HOME", () => {
    expect(
      resolveMcxHome({
        METACODEX_HOME: "/tmp/metacodex-dev",
      }),
    ).toBe(join(homedir(), ".mcx"));
  });

  it("honors MCX_HOME only", () => {
    expect(
      resolveMcxHome({
        [MCX_HOME_ENV]: "/tmp/mcx-dev",
        METACODEX_HOME: "/tmp/metacodex-dev",
      }),
    ).toBe("/tmp/mcx-dev");
  });

  it("trims MCX_HOME and falls back when empty", () => {
    expect(resolveMcxHome({ [MCX_HOME_ENV]: "   " })).toBe(join(homedir(), ".mcx"));
  });
});

describe("mcxPaths", () => {
  it("keeps auth and sessions under the CLI home", () => {
    const paths = mcxPaths("/tmp/mcx-dev");
    expect(paths.auth).toBe("/tmp/mcx-dev/auth.json");
    expect(paths.subagents).toBe("/tmp/mcx-dev/sessions/subagents");
    expect(paths.themes).toBe("/tmp/mcx-dev/themes");
  });
});
