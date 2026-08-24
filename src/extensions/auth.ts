import { join } from "node:path";
import {
  ModelRuntime,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { seedMcxSettings } from "../bootstrap.js";
import {
  CURATED_PROVIDERS,
  findCuratedByPiId,
  findCuratedProvider,
  type AuthMethod,
  type CuratedProvider,
} from "../catalog.js";
import { loadFallbackSettings, saveFallbackSettings } from "./fallback.js";

const CANCEL = "Cancel";
const LOGOUT = "Logout";
const CONNECT = "Connect";
const CHANGE = "Change method";
const DONE = "Done";
const CLEAR = "Clear";
const REMOVE_LAST = "Remove last";
export const FALLBACK_OPTION = "fallback  Fallback chain";

function statusLabel(configured: boolean, source?: string): string {
  if (!configured) return "not connected";
  if (source === "stored") return "connected";
  if (source === "environment") return "env";
  return source ?? "connected";
}

export function formatAuthOption(
  provider: CuratedProvider,
  status: { configured: boolean; source?: string },
): string {
  const methods = provider.methods.join(", ");
  return `${provider.id}  ${provider.label}  [${methods}]  ${statusLabel(status.configured, status.source)}`;
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
  ctx: ExtensionCommandContext,
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
};

async function loginWithMethod(
  runtime: ModelRuntime,
  provider: CuratedProvider,
  method: AuthMethod,
  ctx: ExtensionCommandContext,
): Promise<void> {
  await runtime.login(provider.piId, method, {
    prompt: async (prompt: { message: string; placeholder?: string }) => {
      const value = prompt.placeholder
        ? await ctx.ui.input(prompt.message, prompt.placeholder)
        : await ctx.ui.input(prompt.message);
      if (value === undefined) throw new Error("Login cancelled");
      return value;
    },
    notify: (event: AuthNotifyEvent) => {
      if (event.type === "auth_url" && event.url) {
        const extra = event.instructions ? `${event.instructions} ` : "";
        ctx.ui.notify(`${extra}${event.url}`, "info");
        return;
      }
      if (event.message) ctx.ui.notify(event.message, "info");
    },
  });
}

async function runFallbackEditor(ctx: ExtensionCommandContext, agentDir: string): Promise<void> {
  const current = await loadFallbackSettings(agentDir);
  let chain = [...current.chain];

  for (;;) {
    const remaining = CURATED_PROVIDERS.filter((provider) => !chain.includes(provider.piId));
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
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  if (!agentDir) {
    ctx.ui.notify("mcx home is not set (PI_CODING_AGENT_DIR).", "error");
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
      ...CURATED_PROVIDERS.map((p) => formatAuthOption(p, statusOf(p.piId))),
      FALLBACK_OPTION,
      CANCEL,
    ];
    const picked = await ctx.ui.select("Providers", options);
    if (!picked || picked === CANCEL) return;
    if (isFallbackOption(picked)) {
      await runFallbackEditor(ctx, agentDir);
      return;
    }
    const id = parseAuthOption(picked);
    provider = id ? findCuratedProvider(id) : undefined;
    if (!provider) return;
  }

  const status = statusOf(provider.piId);
  if (status.configured) {
    const actions = [CONNECT, ...(provider.methods.length > 1 ? [CHANGE] : []), LOGOUT, CANCEL];
    const action = await ctx.ui.select(provider.label, actions);
    if (!action || action === CANCEL) return;
    if (action === LOGOUT) {
      try {
        await rt.logout(provider.piId);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Login cancelled") return;
    ctx.ui.notify(`Auth failed: ${message}`, "error");
  }
}

export function registerAuthCommand(pi: ExtensionAPI): void {
  pi.registerCommand("auth", {
    description: "Connect a curated provider, or edit the fallback chain",
    getArgumentCompletions: (prefix) => {
      const q = prefix.trim().toLowerCase();
      const providers = CURATED_PROVIDERS.filter(
        (p) => !q || p.id.startsWith(q) || p.piId.startsWith(q) || p.label.toLowerCase().includes(q),
      ).map((p) => ({
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
      await runAuthCommand(args, ctx, pi);
    },
  });
}
