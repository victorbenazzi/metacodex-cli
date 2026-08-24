#!/usr/bin/env node

import { ensureMcxHome } from "./home.js";
import { installBundledSkill, installBundledThemes, seedMcxSettings } from "./bootstrap.js";
import { isEngineUpdateArg, isHelpArg, isVersionArg, mcxHelp, mcxUpdateRejected } from "./help.js";
import { installResumeHintRewrite } from "./resume.js";
import { hushSkillStartupDump } from "./skills/diagnostics.js";
import { MCX_VERSION, PI_AGENT_DIR_ENV, pinEngineUpdates } from "./version.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (isVersionArg(argv)) {
    process.stdout.write(`mcx ${MCX_VERSION}\n`);
    return;
  }
  if (isHelpArg(argv)) {
    process.stdout.write(mcxHelp());
    return;
  }
  if (isEngineUpdateArg(argv)) {
    process.stdout.write(mcxUpdateRejected());
    return;
  }

  const agentDir = await ensureMcxHome();
  process.env[PI_AGENT_DIR_ENV] = agentDir;
  pinEngineUpdates();
  installResumeHintRewrite();
  await seedMcxSettings(agentDir);
  await installBundledSkill(agentDir);
  await installBundledThemes(agentDir);

  const { DefaultResourceLoader, main: piMain } = await import("@earendil-works/pi-coding-agent");
  hushSkillStartupDump(DefaultResourceLoader);
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
