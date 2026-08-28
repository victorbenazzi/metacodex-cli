export const PLAN_STATUS_KEY = "mcx-plan";
export const PLAN_STATUS_TEXT = "plan";
export const PLAN_TOGGLE_SHORTCUT = "shift+tab";

export const PLAN_ALLOWED_TOOLS = ["read", "grep", "find", "ls"] as const;

export const PLAN_SYSTEM_PROMPT = [
  "Plan mode is on.",
  "You may inspect the codebase with read, grep, find, ls, and read-only bash.",
  "Do not write files, edit files, spawn subagents, or run mutating commands.",
  "Propose a plan and wait. The user turns plan mode off with /plan when they want you to implement.",
].join(" ");

export const PLAN_ON_NOTICE = "Plan mode on. Writes, edits, and spawn are blocked.";
export const PLAN_OFF_NOTICE = "Plan mode off.";

const ALLOWED_TOOL_SET = new Set<string>(PLAN_ALLOWED_TOOLS);

const READ_ONLY_COMMANDS = new Set([
  "base64",
  "basename",
  "cat",
  "cd",
  "cksum",
  "cut",
  "date",
  "diff",
  "dirname",
  "echo",
  "env",
  "false",
  "fd",
  "file",
  "find",
  "git",
  "grep",
  "head",
  "hostname",
  "id",
  "jq",
  "ls",
  "md5sum",
  "nl",
  "printenv",
  "printf",
  "pwd",
  "readlink",
  "realpath",
  "rg",
  "sha1sum",
  "sha256sum",
  "shasum",
  "sleep",
  "stat",
  "tail",
  "test",
  "tree",
  "true",
  "tr",
  "uname",
  "uniq",
  "wc",
  "which",
  "whoami",
]);

const GIT_READ_SUBCOMMANDS = new Set([
  "blame",
  "cat-file",
  "describe",
  "diff",
  "grep",
  "help",
  "log",
  "ls-files",
  "ls-remote",
  "ls-tree",
  "merge-base",
  "rev-list",
  "rev-parse",
  "shortlog",
  "show",
  "status",
  "version",
]);

const GIT_VALUE_FLAGS = new Set(["-C", "-c", "--git-dir", "--work-tree"]);

const HARMLESS_REDIRECT = /(?:\d)?>>?&\d|(?:\d)?>>?\/dev\/null|&>\/dev\/null/g;

export type PlanArgs =
  | { action: "on" | "off" | "toggle" }
  | { action: "error"; message: string };

export type PlanToolDecision = { allow: true } | { allow: false; reason: string };

export function parsePlanArgs(args: string): PlanArgs {
  const token = args.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!token) return { action: "toggle" };
  if (token === "on") return { action: "on" };
  if (token === "off") return { action: "off" };
  return { action: "error", message: `Plan "${token}" is not available. Use /plan, /plan on, or /plan off.` };
}

export function nextPlanEnabled(current: boolean, action: "on" | "off" | "toggle"): boolean {
  if (action === "on") return true;
  if (action === "off") return false;
  return !current;
}

export function planBlockReason(toolName: string, bashCommand?: string): string {
  if (toolName === "spawn") return "Plan mode is on. spawn is blocked. Use /plan off to implement.";
  if (toolName === "write" || toolName === "edit") {
    return "Plan mode is on. File writes are blocked. Use /plan off to implement.";
  }
  if (toolName === "bash") {
    return bashCommand?.trim()
      ? "Plan mode is on. That bash command is not read-only."
      : "Plan mode is on. Bash is only allowed when the command is clearly read-only.";
  }
  return "Plan mode is on. Only read, grep, find, ls, and read-only bash are allowed.";
}

export function decidePlanTool(input: {
  enabled: boolean;
  toolName: string;
  bashCommand?: string | undefined;
}): PlanToolDecision {
  if (!input.enabled) return { allow: true };
  const name = input.toolName.trim().toLowerCase();
  if (ALLOWED_TOOL_SET.has(name)) return { allow: true };
  if (name === "bash") {
    return isReadOnlyBash(input.bashCommand ?? "")
      ? { allow: true }
      : { allow: false, reason: planBlockReason("bash", input.bashCommand) };
  }
  return { allow: false, reason: planBlockReason(name) };
}

export function isReadOnlyBash(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  const visible = maskQuoted(trimmed);
  if (visible.includes("$(") || visible.includes("`") || visible.includes(">(")) return false;
  if (hasFileRedirect(visible)) return false;
  return splitShellList(trimmed).every(isReadOnlySegment);
}

function isReadOnlySegment(segment: string): boolean {
  const argv = tokenize(segment);
  let i = 0;
  while (i < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i] ?? "")) i += 1;
  const cmd = argv[i]?.toLowerCase();
  if (!cmd || !READ_ONLY_COMMANDS.has(cmd)) return false;
  if (cmd === "git") return isReadOnlyGit(argv.slice(i + 1));
  return true;
}

function isReadOnlyGit(args: string[]): boolean {
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg || arg === "--") return true;
    if (GIT_VALUE_FLAGS.has(arg)) {
      i += 2;
      continue;
    }
    if (arg.startsWith("-")) {
      i += 1;
      continue;
    }
    return GIT_READ_SUBCOMMANDS.has(arg.toLowerCase());
  }
  return true;
}

function hasFileRedirect(visible: string): boolean {
  return />/.test(visible.replace(HARMLESS_REDIRECT, " "));
}

function maskQuoted(input: string): string {
  let quote: "'" | '"' | undefined;
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote && input[i - 1] !== "\\") quote = undefined;
      out += " ";
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

function splitShellList(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed) segments.push(trimmed);
    current = "";
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote && command[i - 1] !== "\\") quote = undefined;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "#") break;
    if (ch === "\n" || ch === ";" || ch === "|" || ch === "&") {
      if ((ch === "&" || ch === "|") && command[i + 1] === ch) i += 1;
      flush();
      continue;
    }
    current += ch;
  }
  flush();
  return segments;
}

function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote && segment[i - 1] !== "\\") {
        quote = undefined;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}
