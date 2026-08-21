export const DEFAULT_CHILD_TOOLS = ["read", "bash", "grep", "find", "ls"] as const;
export const OPT_IN_WRITE_TOOLS = ["write", "edit"] as const;
export const SPAWN_TOOL_NAME = "spawn";
export const MAX_LIVE_CHILDREN = 3;
export const CHILD_TIMEOUT_MS = 10 * 60 * 1000;

export type ChildTool =
  | (typeof DEFAULT_CHILD_TOOLS)[number]
  | (typeof OPT_IN_WRITE_TOOLS)[number];

export interface SpawnRequest {
  description: string;
  prompt: string;
  model?: string;
  background?: boolean;
  tools?: string[];
  skills?: string[];
}

export interface SubagentBriefInput {
  objective: string;
  constraints?: string;
  paths?: string[];
}

const ALLOWED_TOOLS = new Set<string>([...DEFAULT_CHILD_TOOLS, ...OPT_IN_WRITE_TOOLS]);

export function canSpawn(liveCount: number): boolean {
  return liveCount < MAX_LIVE_CHILDREN;
}

export function resolveChildTools(requested?: string[]): ChildTool[] {
  if (!requested || requested.length === 0) {
    return [...DEFAULT_CHILD_TOOLS];
  }
  const picked = requested.filter((name): name is ChildTool => ALLOWED_TOOLS.has(name));
  const unique = [...new Set(picked)];
  return unique.length > 0 ? unique : [...DEFAULT_CHILD_TOOLS];
}

export function resolveChildSkills(requested?: string[]): string[] {
  if (!requested) return [];
  return [...new Set(requested.map((s) => s.trim()).filter(Boolean))];
}

export function buildSubagentBrief(input: SubagentBriefInput): string {
  const paths =
    input.paths && input.paths.length > 0
      ? input.paths.map((p) => `- ${p}`).join("\n")
      : "(none given)";
  const constraints = input.constraints?.trim() || "(none given)";

  return [
    "You are a subagent. You do not have the parent transcript.",
    "Do the assigned work and return a single report. Do not spawn other agents.",
    "",
    "Objective:",
    input.objective.trim(),
    "",
    "Constraints:",
    constraints,
    "",
    "Paths in scope:",
    paths,
  ].join("\n");
}

export function childToolsIncludeSpawn(tools: readonly string[]): boolean {
  return tools.includes(SPAWN_TOOL_NAME);
}
