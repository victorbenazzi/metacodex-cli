import { join } from "node:path";
import {
  ModelRuntime,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { seedMcxSettings } from "../bootstrap.js";
import {
  CURATED_PROVIDERS,
  findCuratedProvider,
  type AuthMethod,
  type CuratedProvider,
} from "../catalog.js";

const CANCEL = "Cancel";
const LOGOUT = "Logout";
const CONNECT = "Connect";
const CHANGE = "Change method";

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

  let provider = findCuratedProvider(args);
  if (!provider) {
    const options = CURATED_PROVIDERS.map((p) => formatAuthOption(p, statusOf(p.piId)));
    const picked = await ctx.ui.select("Providers", [...options, CANCEL]);
    if (!picked || picked === CANCEL) return;
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
    description: "Connect a curated provider (OAuth or API key)",
    getArgumentCompletions: (prefix) => {
      const q = prefix.trim().toLowerCase();
      return CURATED_PROVIDERS.filter(
        (p) => !q || p.id.startsWith(q) || p.piId.startsWith(q) || p.label.toLowerCase().includes(q),
      ).map((p) => ({
        value: p.id,
        label: p.label,
        description: p.methods.join(", "),
      }));
    },
    handler: async (args, ctx) => {
      await runAuthCommand(args, ctx, pi);
    },
  });
}
