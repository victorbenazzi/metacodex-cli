import { describe, expect, it } from "vitest";
import {
  MAX_LIVE_CHILDREN,
  buildSubagentBrief,
  canSpawn,
  childToolsIncludeSpawn,
  resolveChildSkills,
  resolveChildTools,
} from "./subagent.js";

describe("subagent", () => {
  it("defaults to the read-only plus bash set", () => {
    expect(resolveChildTools()).toEqual(["read", "bash", "grep", "find", "ls"]);
  });

  it("opts into write/edit only when asked, never spawn", () => {
    expect(resolveChildTools(["read", "edit", "spawn", "rm"])).toEqual(["read", "edit"]);
    expect(childToolsIncludeSpawn(resolveChildTools(["write", "spawn"]))).toBe(false);
  });

  it("starts children with zero skills unless allowlisted", () => {
    expect(resolveChildSkills()).toEqual([]);
    expect(resolveChildSkills([" mcx ", "mcx"])).toEqual(["mcx"]);
  });

  it("caps live children at 3 and isolates the brief from any parent transcript", () => {
    expect(canSpawn(2)).toBe(true);
    expect(canSpawn(MAX_LIVE_CHILDREN)).toBe(false);
    const brief = buildSubagentBrief({
      objective: "find the grant check",
      paths: ["src-tauri/src/util/paths.rs"],
    });
    expect(brief).toContain("You do not have the parent transcript");
    expect(brief).toContain("Do not spawn other agents");
    expect(brief).toContain("src-tauri/src/util/paths.rs");
    expect(brief).not.toContain("Previous model");
  });
});
