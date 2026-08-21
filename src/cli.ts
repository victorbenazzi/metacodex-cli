#!/usr/bin/env node

import { ensureMcxHome } from "./home.js";

async function main(): Promise<void> {
  const agentDir = await ensureMcxHome();
  process.env.PI_CODING_AGENT_DIR = agentDir;

  // InteractiveMode wiring lands in the next slice (DESIGN.md build order step 2).
  // Until then the binary is a real process with a real home, not a fake TUI.
  const { CURATED_PROVIDERS } = await import("./catalog.js");
  process.stdout.write(`mcx 0.0.1\n`);
  process.stdout.write(`home  ${agentDir}\n`);
  process.stdout.write(`auth  /auth  (not wired yet)\n`);
  process.stdout.write(`providers\n`);
  for (const provider of CURATED_PROVIDERS) {
    process.stdout.write(`  ${provider.label}  (${provider.methods.join(", ")})\n`);
  }
  process.stdout.write(`\nSee DESIGN.md for the v1 contract.\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
