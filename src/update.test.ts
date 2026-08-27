import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
    expect(INSTALL_SCRIPT_URL).toBe(
      "https://raw.githubusercontent.com/victorbenazzi/metacodex-cli/main/scripts/install.sh",
    );
    expect(mcxUpdateEnv({ PATH: "/bin" }).MCX_INSTALL_SCRIPT).toBe(INSTALL_SCRIPT_URL);
    expect(mcxUpdateEnv({ MCX_INSTALL_SCRIPT: "file:///tmp/install.sh" }).MCX_INSTALL_SCRIPT).toBe(
      "file:///tmp/install.sh",
    );
  });

  it("does not default MCX_REF to main; the installer picks the latest release", () => {
    expect(mcxUpdateEnv({ PATH: "/bin" }).MCX_REF).toBeUndefined();
  });

  it("passes MCX_REF through so trunk or a pin is explicit", () => {
    expect(mcxUpdateEnv({ MCX_REF: "main" }).MCX_REF).toBe("main");
    expect(mcxUpdateEnv({ MCX_REF: "v0.0.1" }).MCX_REF).toBe("v0.0.1");
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

    const code = await runMcxUpdate({ PATH: "/bin", MCX_REF: "v0.0.1" }, spawnFn);
    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("bash");
    expect(calls[0]?.args).toEqual(["-c", 'curl -fsSL "$MCX_INSTALL_SCRIPT" | bash', "mcx-update"]);
    expect(calls[0]?.env.MCX_INSTALL_SCRIPT).toBe(INSTALL_SCRIPT_URL);
    expect(calls[0]?.env.MCX_REF).toBe("v0.0.1");
  });

  it("does not inject MCX_REF when unset, so install.sh uses the latest release", async () => {
    const calls: { env: NodeJS.ProcessEnv }[] = [];
    const spawnFn: UpdateSpawn = (_command, _args, options) => {
      calls.push({ env: options.env });
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    };

    await runMcxUpdate({ PATH: "/bin" }, spawnFn);
    expect(calls[0]?.env.MCX_REF).toBeUndefined();
  });
});

describe("mcxUpdateFailed", () => {
  it("tells people to use curl and bash", () => {
    expect(mcxUpdateFailed(new Error("spawn bash ENOENT"))).toContain("Need curl and bash");
  });
});

describe("install.sh", () => {
  const script = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../scripts/install.sh"),
    "utf8",
  );

  it("defaults to the latest GitHub release, not main", () => {
    expect(script).not.toMatch(/REF="\$\{MCX_REF:-main\}"/);
    expect(script).toContain("releases/latest");
    expect(script).toContain("latest_release_tag");
    expect(script).toContain("MCX_REF=main");
  });
});
