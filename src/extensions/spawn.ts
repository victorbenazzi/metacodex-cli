import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isCuratedPiProvider } from "../catalog.js";
import { loadFallbackSettings } from "./fallback.js";
import { mcxPaths } from "../home.js";
import { oscAttention } from "../osc.js";
import { extraSkillPaths } from "../skills/discovery.js";
import type { OscWrite } from "./osc.js";
import {
  CHILD_TIMEOUT_MS,
  MAX_LIVE_CHILDREN,
  SPAWN_TOOL_NAME,
  canSpawn,
  extractChildReport,
  formatSpawnProgress,
  resolveChildSkills,
  resolveChildTools,
  resolveSpawnModel,
  wrapChildPrompt,
} from "../router/subagent.js";
import { PI_AGENT_DIR_ENV } from "../version.js";

export const SPAWN_REPORT_CUSTOM_TYPE = "mcx-spawn-report";

const CHILD_SYSTEM = [
  "You are a subagent of mcx.",
  "You do not have the parent transcript.",
  "Do the assigned work and return a single report.",
  "You cannot spawn other agents.",
].join(" ");

export interface ChildRunRequest {
  description: string;
  brief: string;
  model: { provider: string; id: string };
  tools: readonly string[];
  skills: readonly string[];
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal;
  onProgress: (line: string) => void;
}

export interface ChildRunResult {
  ok: boolean;
  report: string;
}

export type ChildRunner = (
  request: ChildRunRequest,
  ctx: ExtensionContext,
) => Promise<ChildRunResult>;

type SpawnDetails = {
  description: string;
  background: boolean;
  childId: string;
  progress?: string;
};

function availableModels(ctx: ExtensionContext): { provider: string; id: string }[] {
  const pool =
    ctx.scopedModels.length > 0
      ? ctx.scopedModels.map((scoped) => scoped.model)
      : ctx.modelRegistry.getAvailable();
  return pool
    .filter((model) => isCuratedPiProvider(model.provider))
    .map((model) => ({ provider: model.provider, id: model.id }));
}

function textFromPartial(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const rec = value as { text?: unknown; output?: unknown; content?: unknown };
  if (typeof rec.text === "string") return rec.text;
  if (typeof rec.output === "string") return rec.output;
  if (!Array.isArray(rec.content)) return "";
  return rec.content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const item = block as { type?: string; text?: string };
      return item.type === "text" && typeof item.text === "string" ? item.text : "";
    })
    .join("");
}

function resultOf(details: SpawnDetails, text: string): { content: { type: "text"; text: string }[]; details: SpawnDetails } {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

export async function runChildSession(
  request: ChildRunRequest,
  ctx: ExtensionContext,
): Promise<ChildRunResult> {
  const agentDir = process.env[PI_AGENT_DIR_ENV];
  if (!agentDir) {
    return { ok: false, report: "mcx home is not set (PI_CODING_AGENT_DIR)." };
  }
  const model = ctx.modelRegistry.find(request.model.provider, request.model.id);
  if (!model) {
    return { ok: false, report: `Model ${request.model.provider}/${request.model.id} is not available.` };
  }

  const skills = [...request.skills];
  const extraSkills = extraSkillPaths(request.cwd);
  const loader = new DefaultResourceLoader({
    cwd: request.cwd,
    agentDir,
    noExtensions: true,
    noSkills: skills.length === 0,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: CHILD_SYSTEM,
    ...(extraSkills.length > 0 ? { additionalSkillPaths: extraSkills } : {}),
    skillsOverride: (base) => ({
      skills: skills.length === 0 ? [] : base.skills.filter((skill) => skills.includes(skill.name)),
      diagnostics: base.diagnostics,
    }),
  });
  await loader.reload();

  const sessionOptions = {
    cwd: request.cwd,
    agentDir,
    model,
    tools: [...request.tools],
    excludeTools: [SPAWN_TOOL_NAME],
    resourceLoader: loader,
    sessionManager: SessionManager.create(request.cwd, mcxPaths(agentDir).subagents),
  };
  const session = (
    await createAgentSession(
      ctx.thinkingLevel
        ? { ...sessionOptions, thinkingLevel: ctx.thinkingLevel }
        : sessionOptions,
    )
  ).session;

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      request.onProgress(formatSpawnProgress(event.toolName));
      return;
    }
    if (event.type === "tool_execution_update") {
      request.onProgress(formatSpawnProgress(event.toolName, textFromPartial(event.partialResult)));
    }
  });

  const abortSession = (): void => {
    void session.abort();
  };
  request.signal.addEventListener("abort", abortSession, { once: true });

  try {
    if (request.signal.aborted) {
      return { ok: false, report: "spawn aborted" };
    }
    await session.prompt(request.brief, { expandPromptTemplates: false });
    if (request.signal.aborted) {
      return { ok: false, report: "spawn aborted" };
    }
    return { ok: true, report: extractChildReport(session.messages) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (request.signal.aborted) return { ok: false, report: "spawn aborted" };
    return { ok: false, report: message };
  } finally {
    request.signal.removeEventListener("abort", abortSession);
    unsubscribe();
    session.dispose();
  }
}

export function registerSpawn(
  pi: ExtensionAPI,
  options: { runChild?: ChildRunner; writeOsc?: OscWrite } = {},
): void {
  const runChild = options.runChild ?? runChildSession;
  const writeOsc = options.writeOsc ?? ((sequence: string) => {
    process.stdout.write(sequence);
  });
  const live = new Map<string, AbortController>();

  const abortAll = (): void => {
    for (const controller of live.values()) controller.abort();
    live.clear();
  };

  pi.on("session_shutdown", () => {
    abortAll();
  });

  pi.on("agent_start", (_event, ctx) => {
    ctx.signal?.addEventListener("abort", abortAll, { once: true });
  });

  pi.registerTool({
    name: SPAWN_TOOL_NAME,
    label: "Spawn",
    description:
      "Delegate work to an isolated subagent. The child does not see this transcript. Put everything it needs in prompt. Default tools are read, bash, grep, find, ls. Pass write/edit only when the child must change files. Pass skills only when it needs a named skill. Max 3 live children.",
    promptSnippet: "Delegate isolated work to a subagent (no parent transcript)",
    promptGuidelines: [
      "Use spawn to delegate isolated work. The child does not see this transcript, so put objective, constraints, and paths in prompt.",
      "Do not spawn more than 3 live children. Children cannot spawn.",
    ],
    parameters: Type.Object({
      description: Type.String({ description: "Short label shown in the parent TUI" }),
      prompt: Type.String({ description: "Brief for the child. Required. Include objective, constraints, and paths." }),
      model: Type.Optional(Type.String({ description: "Curated provider/id, for example anthropic/claude-opus-4-6" })),
      background: Type.Optional(Type.Boolean({ description: "Default false. If true, parent continues while the child runs." })),
      tools: Type.Optional(Type.Array(Type.String(), { description: "Tool allowlist. Default read/bash/grep/find/ls." })),
      skills: Type.Optional(Type.Array(Type.String(), { description: "Skill allowlist. Default none." })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const description = params.description.trim();
      const prompt = params.prompt.trim();
      if (!description || !prompt) {
        return resultOf(
          { description: description || "spawn", background: false, childId: "" },
          "spawn requires description and prompt.",
        );
      }

      if (!canSpawn(live.size)) {
        return resultOf(
          { description, background: false, childId: "" },
          `Already ${MAX_LIVE_CHILDREN} live subagents.`,
        );
      }

      const childId = randomUUID();
      const childAbort = new AbortController();
      live.set(childId, childAbort);

      const agentDir = process.env[PI_AGENT_DIR_ENV];
      const settings = agentDir ? await loadFallbackSettings(agentDir) : { chain: [], maxHops: 2 };
      const resolved = resolveSpawnModel({
        ...(params.model ? { requested: params.model } : {}),
        ...(ctx.model ? { current: { provider: ctx.model.provider, id: ctx.model.id } } : {}),
        chain: settings.chain,
        models: availableModels(ctx),
      });
      if (!resolved) {
        live.delete(childId);
        return resultOf(
          { description, background: false, childId },
          params.model
            ? `Model ${params.model} is not a connected curated model.`
            : "No curated model available for spawn.",
        );
      }

      const onParentAbort = (): void => childAbort.abort();
      signal?.addEventListener("abort", onParentAbort, { once: true });
      ctx.signal?.addEventListener("abort", onParentAbort, { once: true });
      const timeout = setTimeout(() => childAbort.abort(), CHILD_TIMEOUT_MS);

      const background = params.background === true;
      const details: SpawnDetails = { description, background, childId };
      const request: ChildRunRequest = {
        description,
        brief: wrapChildPrompt(prompt),
        model: resolved,
        tools: resolveChildTools(params.tools),
        skills: resolveChildSkills(params.skills),
        cwd: ctx.cwd,
        timeoutMs: CHILD_TIMEOUT_MS,
        signal: childAbort.signal,
        onProgress: (line) => {
          details.progress = line;
          onUpdate?.(resultOf({ ...details, progress: line }, line));
        },
      };

      const finish = async (): Promise<ChildRunResult> => {
        try {
          return await runChild(request, ctx);
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onParentAbort);
          ctx.signal?.removeEventListener("abort", onParentAbort);
          live.delete(childId);
        }
      };

      if (background) {
        const deliver = (ok: boolean, report: string): void => {
          const text = ok
            ? `Subagent finished (${description}):\n${report}`
            : `Subagent failed (${description}): ${report}`;
          if (!ok) writeOsc(oscAttention("subagent failed", description));
          pi.sendMessage(
            {
              customType: SPAWN_REPORT_CUSTOM_TYPE,
              content: text,
              display: true,
            },
            { triggerTurn: true, deliverAs: "followUp" },
          );
        };
        void finish()
          .then((result) => {
            deliver(result.ok, result.report);
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            deliver(false, message);
          });
        return resultOf(details, `Spawned in background: ${description}`);
      }

      const result = await finish();
      if (!result.ok) writeOsc(oscAttention("subagent failed", description));
      const prefix = result.ok ? `Subagent report (${description}):\n` : `Subagent failed (${description}): `;
      return resultOf(details, `${prefix}${result.report}`);
    },
  });
}
