import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  decidePlanTool,
  nextPlanEnabled,
  parsePlanArgs,
  PLAN_OFF_NOTICE,
  PLAN_ON_NOTICE,
  PLAN_STATUS_KEY,
  PLAN_STATUS_TEXT,
  PLAN_SYSTEM_PROMPT,
  PLAN_TOGGLE_SHORTCUT,
} from "../router/plan.js";

function bashCommandFromTool(event: { toolName: string; input: unknown }): string | undefined {
  if (event.toolName !== "bash") return undefined;
  if (!event.input || typeof event.input !== "object") return "";
  const command = (event.input as { command?: unknown }).command;
  return typeof command === "string" ? command : "";
}

function applyPlan(
  enabled: boolean,
  ctx: Pick<ExtensionContext, "ui">,
): void {
  ctx.ui.setStatus(PLAN_STATUS_KEY, enabled ? PLAN_STATUS_TEXT : undefined);
  ctx.ui.notify(enabled ? PLAN_ON_NOTICE : PLAN_OFF_NOTICE, "info");
}

export function registerPlan(pi: ExtensionAPI): void {
  let enabled = false;

  const setEnabled = (next: boolean, ctx: Pick<ExtensionContext, "ui">): void => {
    enabled = next;
    applyPlan(enabled, ctx);
  };

  pi.on("session_start", (event, ctx) => {
    if (event.reason === "new" || event.reason === "resume" || event.reason === "fork") {
      enabled = false;
    }
    ctx.ui.setStatus(PLAN_STATUS_KEY, enabled ? PLAN_STATUS_TEXT : undefined);
  });

  pi.on("tool_call", (event) => {
    const decision = decidePlanTool({
      enabled,
      toolName: event.toolName,
      bashCommand: bashCommandFromTool(event),
    });
    if (!decision.allow) return { block: true, reason: decision.reason };
  });

  pi.on("user_bash", (event) => {
    const decision = decidePlanTool({
      enabled,
      toolName: "bash",
      bashCommand: event.command,
    });
    if (decision.allow) return;
    return {
      result: {
        output: decision.reason,
        exitCode: 1,
        cancelled: false,
        truncated: false,
      },
    };
  });

  pi.on("before_agent_start", (event) => {
    if (!enabled) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${PLAN_SYSTEM_PROMPT}` };
  });

  pi.registerCommand("plan", {
    description: "Toggle plan mode. Read-only tools only",
    getArgumentCompletions: (prefix) => {
      const q = prefix.trim().toLowerCase();
      return (["on", "off"] as const)
        .filter((value) => !q || value.startsWith(q))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx: ExtensionCommandContext) => {
      const parsed = parsePlanArgs(args);
      if (parsed.action === "error") {
        ctx.ui.notify(parsed.message, "error");
        return;
      }
      setEnabled(nextPlanEnabled(enabled, parsed.action), ctx);
    },
  });

  pi.registerShortcut(PLAN_TOGGLE_SHORTCUT, {
    description: "Toggle plan mode",
    handler: (ctx) => {
      setEnabled(!enabled, ctx);
    },
  });
}
