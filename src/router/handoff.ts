import { isCuratedPiProvider } from "../catalog.js";

export const HANDOFF_CUSTOM_TYPE = "mcx-handoff";

const UNSPECIFIED = "(not specified)";
const SEE_DONE = "(see already done)";
const IN_PROGRESS_MAX = 2000;

export interface HandoffPacketInput {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  inProgress: string;
  alreadyDone: string;
  doNotRedo: string;
  userInstruction?: string;
}

export interface HandoffContentBlock {
  type: string;
  text?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

export interface HandoffSourceMessage {
  role: string;
  content?: string | HandoffContentBlock[];
}

export function isCrossProvider(fromProvider: string, toProvider: string): boolean {
  return fromProvider !== toProvider;
}

export function shouldCompactForHandoff(fromWindow: number, toWindow: number): boolean {
  return fromWindow > 0 && toWindow > 0 && toWindow < fromWindow;
}

export function formatHandoffOption(model: { provider: string; id: string; name?: string }): string {
  const key = `${model.provider}/${model.id}`;
  if (model.name && model.name !== model.id) return `${key}  ${model.name}`;
  return key;
}

export function listHandoffTargets<T extends { provider: string; id: string }>(
  models: readonly T[],
  current?: { provider: string; id: string },
): T[] {
  return models.filter((model) => {
    if (!isCuratedPiProvider(model.provider)) return false;
    if (!current) return true;
    return model.provider !== current.provider || model.id !== current.id;
  });
}

export function parseHandoffOption(option: string): { provider: string; id: string } | undefined {
  const key = option.trim().split(/\s+/)[0];
  if (!key) return undefined;
  const slash = key.indexOf("/");
  if (slash <= 0 || slash === key.length - 1) return undefined;
  return { provider: key.slice(0, slash), id: key.slice(slash + 1) };
}

function contentText(content: HandoffSourceMessage["content"]): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

function pathFromArgs(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  for (const key of ["path", "file", "file_path", "filePath"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function collectToolWork(messages: readonly HandoffSourceMessage[]): { done: string[]; paths: string[] } {
  const done: string[] = [];
  const paths: string[] = [];
  const seen = new Set<string>();

  const push = (line: string): void => {
    if (seen.has(line)) return;
    seen.add(line);
    done.push(line);
  };

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type !== "toolCall" && block.type !== "toolUse") continue;
      const name = block.name?.trim() || "tool";
      const path = pathFromArgs(block.arguments);
      if (path) {
        paths.push(path);
        push(`${name} ${path}`);
        continue;
      }
      if (name === "bash" && typeof block.arguments?.command === "string") {
        push(`bash ${clip(block.arguments.command, 80)}`);
        continue;
      }
      push(name);
    }
  }
  return { done, paths };
}

/** Fill packet fields from the live transcript. No extra model call. */
export function deriveHandoffFields(messages: readonly HandoffSourceMessage[]): Pick<
  HandoffPacketInput,
  "inProgress" | "alreadyDone" | "doNotRedo"
> {
  let inProgress = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const text = contentText(message.content);
    if (!text || text.startsWith("This session is a handoff")) continue;
    inProgress = clip(text, IN_PROGRESS_MAX);
    break;
  }

  const { done, paths } = collectToolWork(messages);
  const uniquePaths = [...new Set(paths)];
  return {
    inProgress: inProgress || UNSPECIFIED,
    alreadyDone: done.length > 0 ? done.map((line) => `- ${line}`).join("\n") : UNSPECIFIED,
    doNotRedo:
      uniquePaths.length > 0 ? `do not rewrite: ${uniquePaths.join(", ")}` : SEE_DONE,
  };
}

export function buildHandoffPacket(input: HandoffPacketInput): string {
  const instruction = input.userInstruction?.trim();
  const lines = [
    "This session is a handoff. You are taking over an in-flight coding task. Do not restart from scratch.",
    `Previous model: ${input.fromProvider}/${input.fromModel}`,
    `Your model: ${input.toProvider}/${input.toModel}`,
    "",
    "In progress:",
    input.inProgress.trim() || UNSPECIFIED,
    "",
    "Already done (do not redo):",
    input.alreadyDone.trim() || UNSPECIFIED,
    "",
    "Do not redo:",
    input.doNotRedo.trim() || SEE_DONE,
    "",
    "Tool results already in this transcript are ground truth. Continue from them.",
  ];

  if (instruction) {
    lines.push("", "User instruction for this handoff:", instruction);
  }

  return lines.join("\n");
}
