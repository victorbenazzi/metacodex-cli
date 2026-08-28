import { isCuratedPiProvider } from "../catalog.js";

export const HANDOFF_CUSTOM_TYPE = "mcx-handoff";

const UNSPECIFIED = "(not specified)";
const SEE_DONE = "(see already done)";
const IN_PROGRESS_MAX = 2000;
const TOOL_RESULT_CLIP = 400;
const TOOL_RESULT_N = 8;

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
  toolName?: string;
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

/** True when the thread has a real user/assistant turn. Skills, MCP, and system prompt do not count. */
export function hasConversationTurns(messages: readonly HandoffSourceMessage[]): boolean {
  return messages.some((message) => {
    if (message.role === "user") {
      const text = contentText(message.content);
      return Boolean(text) && !text.startsWith("This session is a handoff");
    }
    if (message.role !== "assistant") return false;
    if (typeof message.content === "string") return message.content.trim().length > 0;
    if (!Array.isArray(message.content)) return false;
    return message.content.some((block) => {
      if (block.type === "text") return Boolean(block.text?.trim());
      return block.type === "toolCall" || block.type === "toolUse";
    });
  });
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

function collectTranscriptWork(messages: readonly HandoffSourceMessage[]): {
  done: string[];
  paths: string[];
  results: string[];
} {
  const done: string[] = [];
  const paths: string[] = [];
  const results: string[] = [];
  const seen = new Set<string>();

  const pushDone = (line: string): void => {
    if (seen.has(line)) return;
    seen.add(line);
    done.push(line);
  };

  const pushResult = (name: string, text: string): void => {
    const clipped = clip(text, TOOL_RESULT_CLIP);
    if (!clipped) return;
    results.push(`result (${name.trim() || "tool"}): ${clipped}`);
  };

  for (const message of messages) {
    if (message.role === "toolResult") {
      const text = contentText(message.content);
      if (text) pushResult(message.toolName ?? "tool", text);
      continue;
    }
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === "toolCall" || block.type === "toolUse") {
        const name = block.name?.trim() || "tool";
        const path = pathFromArgs(block.arguments);
        if (path) {
          paths.push(path);
          pushDone(`${name} ${path}`);
          continue;
        }
        if (name === "bash" && typeof block.arguments?.command === "string") {
          pushDone(`bash ${clip(block.arguments.command, 80)}`);
          continue;
        }
        pushDone(name);
        continue;
      }
      if (block.type === "toolResult" && typeof block.text === "string" && block.text.trim()) {
        pushResult(block.name ?? "tool", block.text.trim());
      }
    }
  }

  return { done, paths, results: results.slice(-TOOL_RESULT_N) };
}

/** Fill packet fields from the live transcript. No extra model call. */
export function deriveHandoffFields(
  messages: readonly HandoffSourceMessage[],
): Pick<HandoffPacketInput, "inProgress" | "alreadyDone" | "doNotRedo"> {
  let inProgress = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const text = contentText(message.content);
    if (!text || text.startsWith("This session is a handoff")) continue;
    inProgress = clip(text, IN_PROGRESS_MAX);
    break;
  }

  const { done, paths, results } = collectTranscriptWork(messages);
  const uniquePaths = [...new Set(paths)];
  const alreadyLines = [...done, ...results];
  return {
    inProgress: inProgress || UNSPECIFIED,
    alreadyDone:
      alreadyLines.length > 0 ? alreadyLines.map((line) => `- ${line}`).join("\n") : UNSPECIFIED,
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
