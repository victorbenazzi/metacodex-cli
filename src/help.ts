import { MCX_VERSION } from "./version.js";

export function isHelpArg(argv: readonly string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

export function isVersionArg(argv: readonly string[]): boolean {
  return argv.includes("--version") || argv.includes("-V");
}

export function isEngineUpdateArg(argv: readonly string[]): boolean {
  return argv[0] === "update";
}

export function mcxUpdateRejected(): string {
  return [
    "mcx pins the Pi engine. Do not run pi update from here.",
    "When the engine moves, a new mcx version ships it.",
    "",
  ].join("\n");
}

export function mcxHelp(version = MCX_VERSION): string {
  return [
    `mcx ${version}`,
    "",
    "Multi-provider coding agent. Session router on the Pi engine.",
    "",
    "Usage:",
    "  mcx                  Interactive session",
    "  mcx -p <prompt>      Print mode (one shot)",
    "  mcx --session <id>   Resume a session from ~/.mcx",
    "  mcx --version",
    "  mcx --help",
    "",
    "Home: ~/.mcx (override with MCX_HOME)",
    "",
    "In-session commands:",
    "  /auth       Connect a curated provider, or edit the fallback chain",
    "  /handoff    Hand off this session to another curated model",
    "  /model      Switch model. Cross-provider also injects a handoff packet",
    "",
    "Other flags are passed to the Pi engine.",
    "",
  ].join("\n");
}
