import { spawn } from "node:child_process";

export const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/victorbenazzi/metacodex-cli/main/scripts/install.sh";

export type UpdateChild = {
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null) => void): unknown;
};

export type UpdateSpawn = (
  command: string,
  args: readonly string[],
  options: { stdio: "inherit"; env: NodeJS.ProcessEnv },
) => UpdateChild;

export function isUpdateArg(argv: readonly string[]): boolean {
  return argv[0] === "update";
}

export function mcxUpdateEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    MCX_INSTALL_SCRIPT: env.MCX_INSTALL_SCRIPT?.trim() || INSTALL_SCRIPT_URL,
  };
}

export function mcxUpdateFailed(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return [
    `mcx update failed: ${message}`,
    "Need curl and bash. Or re-run the installer from GitHub.",
    "",
  ].join("\n");
}

/** Re-run the GitHub installer. Same path as first install. Does not touch ~/.mcx. */
export function runMcxUpdate(
  env: NodeJS.ProcessEnv = process.env,
  spawnFn: UpdateSpawn = spawn,
): Promise<number> {
  const child = spawnFn("bash", ["-c", 'curl -fsSL "$MCX_INSTALL_SCRIPT" | bash', "mcx-update"], {
    stdio: "inherit",
    env: mcxUpdateEnv(env),
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}
