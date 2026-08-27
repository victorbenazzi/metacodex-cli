import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  INSTALL_SCRIPT_URL,
  isUpdateArg,
  mcxUpdateEnv,
  mcxUpdateFailed,
  runMcxUpdate,
  type UpdateSpawn,
} from "./update.js";

describe("isUpdateArg", () => {
  it("matches mcx update before Pi sees the argv", () => {
    expect(isUpdateArg(["update"])).toBe(true);
    expect(isUpdateArg(["update", "--self"])).toBe(true);
    expect(isUpdateArg(["-p", "hi"])).toBe(false);
  });
});

describe("mcxUpdateEnv", () => {
  it("points curl at the GitHub installer unless MCX_INSTALL_SCRIPT is set", () => {
    expect(mcxUpdateEnv({ PATH: "/bin" }).MCX_INSTALL_SCRIPT).toBe(INSTALL_SCRIPT_URL);
    expect(mcxUpdateEnv({ MCX_INSTALL_SCRIPT: "file:///tmp/install.sh" }).MCX_INSTALL_SCRIPT).toBe(
      "file:///tmp/install.sh",
    );
  });
});

describe("runMcxUpdate", () => {
  it("runs bash that curls the installer and keeps MCX_REF", async () => {
    const calls: { command: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
    const spawnFn: UpdateSpawn = (command, args, options) => {
      calls.push({ command, args: [...args], env: options.env });
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    };

    const code = await runMcxUpdate({ PATH: "/bin", MCX_REF: "main" }, spawnFn);
    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("bash");
    expect(calls[0]?.args).toEqual(["-c", 'curl -fsSL "$MCX_INSTALL_SCRIPT" | bash', "mcx-update"]);
    expect(calls[0]?.env.MCX_INSTALL_SCRIPT).toBe(INSTALL_SCRIPT_URL);
    expect(calls[0]?.env.MCX_REF).toBe("main");
  });
});

describe("mcxUpdateFailed", () => {
  it("tells people to use curl and bash", () => {
    expect(mcxUpdateFailed(new Error("spawn bash ENOENT"))).toContain("Need curl and bash");
  });
});
