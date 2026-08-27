#!/usr/bin/env node

import { ensureMcxHome } from "./home.js";
import {
  installBundledKeybindings,
  installBundledSkill,
  installBundledThemes,
  seedMcxSettings,
} from "./bootstrap.js";
import { installEngineShims } from "./engine/install.js";
import { installResumeHintRewrite } from "./engine/resume.js";
import { isHelpArg, isVersionArg, mcxHelp } from "./help.js";
import { isUpdateArg, mcxUpdateFailed, runMcxUpdate } from "./update.js";
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
  if (isUpdateArg(argv)) {
    try {
      process.exitCode = await runMcxUpdate();
    } catch (error: unknown) {
      process.stderr.write(mcxUpdateFailed(error));
      process.exitCode = 1;
    }
    return;
  }

  const agentDir = await ensureMcxHome();
  process.env[PI_AGENT_DIR_ENV] = agentDir;
  pinEngineUpdates();
  installResumeHintRewrite();
  await Promise.all([
    seedMcxSettings(agentDir),
    installBundledSkill(agentDir),
    installBundledThemes(agentDir),
    installBundledKeybindings(agentDir),
  ]);

  const { DefaultResourceLoader, ModelRuntime, main: piMain } = await import(
    "@earendil-works/pi-coding-agent"
  );
  installEngineShims(DefaultResourceLoader, ModelRuntime);
  const { createMcxExtension } = await import("./extensions/mcx.js");
  await piMain(argv, {
    extensionFactories: [createMcxExtension(agentDir)],
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
