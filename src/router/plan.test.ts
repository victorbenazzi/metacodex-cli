import { describe, expect, it } from "vitest";
import {
  decidePlanTool,
  isReadOnlyBash,
  nextPlanEnabled,
  parsePlanArgs,
  planBlockReason,
} from "./plan.js";

describe("parsePlanArgs", () => {
  it("toggles with no args and accepts on/off", () => {
    expect(parsePlanArgs("")).toEqual({ action: "toggle" });
    expect(parsePlanArgs("  ")).toEqual({ action: "toggle" });
    expect(parsePlanArgs("on")).toEqual({ action: "on" });
    expect(parsePlanArgs("OFF")).toEqual({ action: "off" });
  });

  it("rejects unknown args", () => {
    const result = parsePlanArgs("maybe");
    expect(result.action).toBe("error");
    if (result.action === "error") expect(result.message).toContain("/plan off");
  });
});

describe("nextPlanEnabled", () => {
  it("applies on, off, and toggle", () => {
    expect(nextPlanEnabled(false, "on")).toBe(true);
    expect(nextPlanEnabled(true, "off")).toBe(false);
    expect(nextPlanEnabled(false, "toggle")).toBe(true);
    expect(nextPlanEnabled(true, "toggle")).toBe(false);
  });
});

describe("decidePlanTool", () => {
  it("allows every tool when plan is off", () => {
    expect(decidePlanTool({ enabled: false, toolName: "write" })).toEqual({ allow: true });
    expect(decidePlanTool({ enabled: false, toolName: "spawn" })).toEqual({ allow: true });
    expect(decidePlanTool({ enabled: false, toolName: "bash", bashCommand: "rm -rf src" })).toEqual({
      allow: true,
    });
  });

  it("allows read tools and blocks write, edit, and spawn", () => {
    for (const toolName of ["read", "grep", "find", "ls"] as const) {
      expect(decidePlanTool({ enabled: true, toolName })).toEqual({ allow: true });
    }
    expect(decidePlanTool({ enabled: true, toolName: "write" })).toEqual({
      allow: false,
      reason: planBlockReason("write"),
    });
    expect(decidePlanTool({ enabled: true, toolName: "edit" })).toEqual({
      allow: false,
      reason: planBlockReason("edit"),
    });
    expect(decidePlanTool({ enabled: true, toolName: "spawn" })).toEqual({
      allow: false,
      reason: planBlockReason("spawn"),
    });
  });

  it("allows read-only bash and refuses mutating bash", () => {
    expect(decidePlanTool({ enabled: true, toolName: "bash", bashCommand: "ls src" })).toEqual({
      allow: true,
    });
    expect(decidePlanTool({ enabled: true, toolName: "bash", bashCommand: "rm src/a.ts" })).toEqual({
      allow: false,
      reason: planBlockReason("bash", "rm src/a.ts"),
    });
  });

  it("blocks the MCP proxy and other unknown tools", () => {
    expect(decidePlanTool({ enabled: true, toolName: "mcp" }).allow).toBe(false);
    expect(decidePlanTool({ enabled: true, toolName: "unknown" }).allow).toBe(false);
  });
});

describe("isReadOnlyBash", () => {
  it("allows inspection commands and git reads", () => {
    expect(isReadOnlyBash("ls -la src")).toBe(true);
    expect(isReadOnlyBash("rg plan src")).toBe(true);
    expect(isReadOnlyBash("find . -name '*.ts'")).toBe(true);
    expect(isReadOnlyBash("cat README.md | rg mcx")).toBe(true);
    expect(isReadOnlyBash("git status")).toBe(true);
    expect(isReadOnlyBash("git --no-pager log -1")).toBe(true);
    expect(isReadOnlyBash("git -C src diff")).toBe(true);
    expect(isReadOnlyBash("FOO=1 ls")).toBe(true);
    expect(isReadOnlyBash("ls 2>/dev/null")).toBe(true);
    expect(isReadOnlyBash("echo hi")).toBe(true);
  });

  it("refuses writes, redirects, and unknown binaries", () => {
    expect(isReadOnlyBash("")).toBe(false);
    expect(isReadOnlyBash("rm -rf src")).toBe(false);
    expect(isReadOnlyBash("ls > out.txt")).toBe(false);
    expect(isReadOnlyBash("cat a >> b")).toBe(false);
    expect(isReadOnlyBash("echo hi > file")).toBe(false);
    expect(isReadOnlyBash("git commit -m 'x'")).toBe(false);
    expect(isReadOnlyBash("git checkout main")).toBe(false);
    expect(isReadOnlyBash("git stash pop")).toBe(false);
    expect(isReadOnlyBash("sed -i s/a/b/ file")).toBe(false);
    expect(isReadOnlyBash("sort -o out.txt in.txt")).toBe(false);
    expect(isReadOnlyBash("pnpm test")).toBe(false);
    expect(isReadOnlyBash("ls && rm file")).toBe(false);
    expect(isReadOnlyBash("ls | tee out")).toBe(false);
    expect(isReadOnlyBash("sudo ls")).toBe(false);
    expect(isReadOnlyBash("echo $(rm file)")).toBe(false);
    expect(isReadOnlyBash("git branch -d old")).toBe(false);
    expect(isReadOnlyBash("git tag v1.0.0")).toBe(false);
    expect(isReadOnlyBash("git config user.email a@b.c")).toBe(false);
  });
});
