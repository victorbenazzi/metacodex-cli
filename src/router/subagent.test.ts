import { describe, expect, it } from "vitest";
import {
  MAX_LIVE_CHILDREN,
  buildSubagentBrief,
  canSpawn,
  childToolsIncludeSpawn,
  extractChildReport,
  formatSpawnProgress,
  resolveChildSkills,
  resolveChildTools,
  resolveSpawnModel,
  wrapChildPrompt,
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

  it("wraps the spawn prompt so the child never sees a parent transcript", () => {
    const wrapped = wrapChildPrompt("find the grant check");
    expect(wrapped).toContain("You do not have the parent transcript");
    expect(wrapped).toContain("find the grant check");
  });

  it("pins the requested model, else the parent, else the fallback chain", () => {
    const models = [
      { provider: "anthropic", id: "opus" },
      { provider: "deepseek", id: "deepseek-chat" },
    ];
    expect(
      resolveSpawnModel({
        requested: "deepseek/deepseek-chat",
        current: { provider: "anthropic", id: "opus" },
        chain: ["anthropic", "deepseek"],
        models,
      }),
    ).toEqual({ provider: "deepseek", id: "deepseek-chat" });
    expect(
      resolveSpawnModel({
        current: { provider: "anthropic", id: "opus" },
        chain: ["deepseek"],
        models,
      }),
    ).toEqual({ provider: "anthropic", id: "opus" });
    expect(
      resolveSpawnModel({
        chain: ["deepseek"],
        models,
      }),
    ).toEqual({ provider: "deepseek", id: "deepseek-chat" });
    expect(
      resolveSpawnModel({
        requested: "openrouter/hidden",
        models,
        chain: [],
      }),
    ).toBeUndefined();
  });

  it("keeps parent progress to tool name plus last line", () => {
    expect(formatSpawnProgress("bash", "line one\nline two\n")).toBe("bash  line two");
    expect(formatSpawnProgress("read")).toBe("read");
    expect(
      extractChildReport([
        { role: "user", content: "do it" },
        { role: "assistant", content: [{ type: "text", text: "the report" }] },
      ]),
    ).toBe("the report");
  });
});
