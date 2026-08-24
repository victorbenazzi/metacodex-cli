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

export function wrapChildPrompt(prompt: string): string {
  return buildSubagentBrief({ objective: prompt });
}

export function lastProgressLine(text: string): string {
  const trimmed = text.replace(/\s+$/u, "");
  if (!trimmed) return "";
  const lines = trimmed.split(/\r?\n/u);
  return lines[lines.length - 1] ?? "";
}

export function formatSpawnProgress(toolName: string, output?: string): string {
  const line = output ? lastProgressLine(output) : "";
  return line ? `${toolName}  ${line}` : toolName;
}

export function extractChildReport(
  messages: readonly { role: string; content?: unknown }[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const content = message.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (!Array.isArray(content)) continue;
    const text = content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        const rec = block as { type?: string; text?: string };
        return rec.type === "text" && typeof rec.text === "string" ? rec.text.trim() : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "(no report)";
}

export function parseSpawnModel(raw: string): { provider: string; id: string } | undefined {
  const key = raw.trim().split(/\s+/u)[0];
  if (!key) return undefined;
  const slash = key.indexOf("/");
  if (slash <= 0 || slash === key.length - 1) return undefined;
  return { provider: key.slice(0, slash), id: key.slice(slash + 1) };
}

export function resolveSpawnModel(input: {
  requested?: string;
  current?: { provider: string; id: string };
  chain: readonly string[];
  models: readonly { provider: string; id: string }[];
}): { provider: string; id: string } | undefined {
  const has = (provider: string, id: string): boolean =>
    input.models.some((model) => model.provider === provider && model.id === id);
  const firstFor = (provider: string): { provider: string; id: string } | undefined =>
    input.models.find((model) => model.provider === provider);

  if (input.requested) {
    const parsed = parseSpawnModel(input.requested);
    if (!parsed || !has(parsed.provider, parsed.id)) return undefined;
    return parsed;
  }
  if (input.current && has(input.current.provider, input.current.id)) {
    return input.current;
  }
  for (const provider of input.chain) {
    const model = firstFor(provider);
    if (model) return { provider: model.provider, id: model.id };
  }
  const first = input.models[0];
  return first ? { provider: first.provider, id: first.id } : undefined;
}
