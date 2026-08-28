import { MCX_VERSION } from "./version.js";

export function isHelpArg(argv: readonly string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

export function isVersionArg(argv: readonly string[]): boolean {
  return argv.includes("--version") || argv.includes("-V");
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
    "  mcx update           Install latest GitHub release. Does not touch ~/.mcx",
    "  mcx --version",
    "  mcx --help",
    "",
    "Home: ~/.mcx (override with MCX_HOME)",
    "",
    "In-session commands:",
    "  /auth       Connect a curated provider, or edit the fallback chain",
    "  /clear      Start a new session. Same as /new",
    "  /effort     Set this session's thinking effort",
    "  /handoff    Hand off this session to another curated model",
    "  /mcp        List and manage MCP servers (proxy tool, not dumped into the prompt)",
    "  /model      Switch model. Cross-provider also injects a handoff packet",
    "  /plan       Toggle plan mode. Read-only tools only. Shift+Tab does the same",
    "",
    "Other flags are passed to the Pi engine.",
    "",
  ].join("\n");
}
