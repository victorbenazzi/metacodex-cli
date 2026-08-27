import { join } from "node:path";
import {
  ModelRuntime,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { seedMcxSettings } from "../bootstrap.js";
import {
  findCuratedByPiId,
  findCuratedProvider,
  providersForUi,
  type AuthMethod,
  type CuratedProvider,
} from "../catalog.js";
import { formatAuthRows, isPickerSeparator } from "../picker.js";
import { deviceCodeWidgetLines, oauthWidgetLines, openUrl } from "../oauth-ui.js";
import { authRedirectArgs, isEnterKey, wrapAuthAutocomplete } from "./auth-redirect.js";
import { loadFallbackSettings, saveFallbackSettings } from "../settings.js";

const CANCEL = "Cancel";
const LOGOUT = "Logout";
const CONNECT = "Connect";
const CHANGE = "Change method";
const DONE = "Done";
const CLEAR = "Clear";
const REMOVE_LAST = "Remove last";
export const FALLBACK_OPTION = "fallback  Fallback chain";

export function formatAuthOption(
  provider: CuratedProvider,
  status: { configured: boolean; source?: string },
): string {
  return formatAuthRows([provider], () => status)[0] ?? "";
}

export function parseAuthOption(option: string): string | undefined {
  const id = option.trim().split(/\s+/)[0];
  return id && findCuratedProvider(id) ? id : undefined;
}

export function isFallbackOption(option: string): boolean {
  return option.trim().split(/\s+/)[0] === "fallback";
}

export function formatFallbackChain(chain: readonly string[]): string {
  if (chain.length === 0) return "(empty, same-model retry)";
  return chain.map((piId) => findCuratedByPiId(piId)?.id ?? piId).join(", ");
}

function methodLabel(method: AuthMethod): string {
  return method === "oauth" ? "OAuth / subscription" : "API key";
}

async function pickMethod(
  provider: CuratedProvider,
  ctx: ExtensionContext,
): Promise<AuthMethod | undefined> {
  if (provider.methods.length === 1) return provider.methods[0];
  const labels = provider.methods.map(methodLabel);
  const picked = await ctx.ui.select(`Auth for ${provider.label}`, [...labels, CANCEL]);
  if (!picked || picked === CANCEL) return undefined;
  return provider.methods[labels.indexOf(picked)];
}

async function runtimeFor(agentDir: string): Promise<ModelRuntime> {
  return ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
    refreshOnCreate: false,
  });
}

type AuthNotifyEvent = {
  type?: string;
  url?: string;
  message?: string;
  instructions?: string;
  userCode?: string;
  verificationUri?: string;
};

type AuthLoginPrompt =
  | {
      type?: "text" | "secret" | "manual_code";
      message: string;
      placeholder?: string;
    }
  | {
      type: "select";
      message: string;
      options: readonly { id: string; label: string; description?: string }[];
    };

export function formatLoginOption(option: { id: string; label: string; description?: string }): string {
  return option.description ? `${option.id}  ${option.label}  ${option.description}` : `${option.id}  ${option.label}`;
}

export function parseLoginOption(
  option: string,
  choices: readonly { id: string }[],
): string | undefined {
  const id = option.trim().split(/\s+/)[0];
  return id && choices.some((choice) => choice.id === id) ? id : undefined;
}

export async function answerLoginPrompt(
  prompt: AuthLoginPrompt,
  ctx: ExtensionContext,
): Promise<string> {
  if (prompt.type === "select") {
    if (prompt.options.length === 0) {
      throw new Error("Login cancelled");
    }
    if (prompt.options.length === 1) {
      const only = prompt.options[0];
      if (!only) throw new Error("Login cancelled");
      return only.id;
    }
    const picked = await ctx.ui.select(prompt.message, [
      ...prompt.options.map(formatLoginOption),
      CANCEL,
    ]);
    if (!picked || picked === CANCEL) throw new Error("Login cancelled");
    const id = parseLoginOption(picked, prompt.options);
    if (!id) throw new Error("Login cancelled");
    return id;
  }

  const value = prompt.placeholder
    ? await ctx.ui.input(prompt.message, prompt.placeholder)
    : await ctx.ui.input(prompt.message);
  if (value === undefined) throw new Error("Login cancelled");
  return value;
}

async function loginWithMethod(
  runtime: ModelRuntime,
  provider: CuratedProvider,
  method: AuthMethod,
  ctx: ExtensionContext,
): Promise<void> {
  await runtime.login(provider.piId, method, {
    prompt: async (prompt) => answerLoginPrompt(prompt as AuthLoginPrompt, ctx),
    notify: (event: AuthNotifyEvent) => {
      if (event.type === "auth_url" && event.url) {
        openUrl(event.url);
        ctx.ui.setWidget("mcx-oauth", oauthWidgetLines(event.url, event.instructions));
        return;
      }
      if (event.type === "device_code" && event.verificationUri && event.userCode) {
        openUrl(event.verificationUri);
        ctx.ui.setWidget(
          "mcx-oauth",
          deviceCodeWidgetLines({ userCode: event.userCode, verificationUri: event.verificationUri }),
        );
        return;
      }
      if (event.message) ctx.ui.notify(event.message, "info");
    },
  });
}

async function runFallbackEditor(ctx: ExtensionContext, agentDir: string): Promise<void> {
  const current = await loadFallbackSettings(agentDir);
  let chain = [...current.chain];

  for (;;) {
    const remaining = providersForUi().filter((provider) => !chain.includes(provider.piId));
    const options = [
      ...remaining.map((provider) => `${provider.id}  ${provider.label}`),
      ...(chain.length > 0 ? [REMOVE_LAST, CLEAR] : []),
      DONE,
      CANCEL,
    ];
    const picked = await ctx.ui.select(`Fallback: ${formatFallbackChain(chain)}`, options);
    if (!picked || picked === CANCEL) return;
    if (picked === DONE) {
      await saveFallbackSettings(agentDir, { chain, maxHops: current.maxHops });
      ctx.ui.notify(`Fallback chain: ${formatFallbackChain(chain)}`, "info");
      return;
    }
    if (picked === CLEAR) {
      chain = [];
      continue;
    }
    if (picked === REMOVE_LAST) {
      chain = chain.slice(0, -1);
      continue;
    }
    const id = parseAuthOption(picked);
    const provider = id ? findCuratedProvider(id) : undefined;
    if (provider && !chain.includes(provider.piId)) chain.push(provider.piId);
  }
}

export async function runAuthCommand(
  args: string,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  agentDir: string,
): Promise<void> {
  if (!agentDir) {
    ctx.ui.notify("mcx home is not set.", "error");
    return;
  }
  const rt = await runtimeFor(agentDir);
  const statusOf = (piId: string) => ctx.modelRegistry.getProviderAuthStatus(piId);
  const trimmed = args.trim().toLowerCase();
  if (trimmed === "fallback") {
    await runFallbackEditor(ctx, agentDir);
    return;
  }

  let provider = findCuratedProvider(args);
  if (!provider) {
    const options = [
      ...formatAuthRows(providersForUi(), statusOf),
      "──",
      FALLBACK_OPTION,
      CANCEL,
    ];
    for (;;) {
      const picked = await ctx.ui.select("Providers", options);
      if (!picked || picked === CANCEL) return;
      if (isPickerSeparator(picked)) continue;
      if (isFallbackOption(picked)) {
        await runFallbackEditor(ctx, agentDir);
        return;
      }
      const id = parseAuthOption(picked);
      provider = id ? findCuratedProvider(id) : undefined;
      if (!provider) return;
      break;
    }
  }

  const status = statusOf(provider.piId);
  if (status.configured) {
    const actions = [CONNECT, ...(provider.methods.length > 1 ? [CHANGE] : []), LOGOUT, CANCEL];
    const action = await ctx.ui.select(provider.label, actions);
    if (!action || action === CANCEL) return;
    if (action === LOGOUT) {
      try {
        await rt.logout(provider.piId);
        await seedMcxSettings(agentDir);
        await ctx.modelRegistry.refresh();
        ctx.ui.notify(`Logged out of ${provider.label}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Logout failed: ${message}`, "error");
      }
      return;
    }
  }

  const method = await pickMethod(provider, ctx);
  if (!method) return;

  try {
    await loginWithMethod(rt, provider, method, ctx);
    await seedMcxSettings(agentDir);
    await ctx.modelRegistry.refresh();
    const available = ctx.modelRegistry.getAvailable().filter((m) => m.provider === provider.piId);
    if (!ctx.model && available[0]) {
      await pi.setModel(available[0]);
    }
    ctx.ui.notify(
      method === "oauth" ? `Logged in to ${provider.label}` : `Saved API key for ${provider.label}`,
      "info",
    );
    if (provider.id === "anthropic" && method === "oauth") {
      ctx.ui.notify(
        "Anthropic OAuth here uses extra usage, not the Claude Pro plan. If extra usage is empty, connect an API key in /auth.",
        "warning",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Login cancelled") return;
    ctx.ui.notify(`Auth failed: ${message}`, "error");
  } finally {
    ctx.ui.setWidget("mcx-oauth", undefined);
  }
}

export function registerAuthCommand(pi: ExtensionAPI, options: { agentDir: string }): void {
  let stopRedirect: (() => void) | undefined;
  let autocompleteInstalled = false;

  pi.on("session_shutdown", () => {
    stopRedirect?.();
    stopRedirect = undefined;
  });

  pi.on("session_start", (_event, ctx) => {
    stopRedirect?.();
    if (ctx.mode !== "tui") return;
    if (!autocompleteInstalled) {
      autocompleteInstalled = true;
      ctx.ui.addAutocompleteProvider(wrapAuthAutocomplete);
    }
    stopRedirect = ctx.ui.onTerminalInput((data) => {
      if (!isEnterKey(data)) return;
      const args = authRedirectArgs(ctx.ui.getEditorText());
      if (args === undefined) return;
      ctx.ui.setEditorText("");
      void runAuthCommand(args, ctx, pi, options.agentDir);
      return { consume: true };
    });
  });

  pi.registerCommand("auth", {
    description: "Connect a curated provider, or edit the fallback chain",
    getArgumentCompletions: (prefix) => {
      const q = prefix.trim().toLowerCase();
      const providers = providersForUi()
        .filter(
          (p) => !q || p.id.startsWith(q) || p.piId.startsWith(q) || p.label.toLowerCase().includes(q),
        )
        .map((p) => ({
        value: p.id,
        label: p.label,
        description: p.methods.join(", "),
      }));
      if (!q || "fallback".startsWith(q)) {
        providers.push({
          value: "fallback",
          label: "Fallback chain",
          description: "ordered hop list",
        });
      }
      return providers;
    },
    handler: async (args, ctx) => {
      await runAuthCommand(args, ctx, pi, options.agentDir);
    },
  });
}
