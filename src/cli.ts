#!/usr/bin/env node

import { ensureMcxHome } from "./home.js";
import { installBundledSkill, seedMcxSettings } from "./bootstrap.js";
import { MCX_VERSION, PI_AGENT_DIR_ENV } from "./version.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-V")) {
    process.stdout.write(`mcx ${MCX_VERSION}\n`);
    return;
  }

  const agentDir = await ensureMcxHome();
  process.env[PI_AGENT_DIR_ENV] = agentDir;
  await seedMcxSettings(agentDir);
  await installBundledSkill(agentDir);

  const { main: piMain } = await import("@earendil-works/pi-coding-agent");
  const { createMcxExtension } = await import("./extensions/mcx.js");
  await piMain(argv, {
    extensionFactories: [createMcxExtension()],
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
