import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { CURATED_PROVIDERS } from "../catalog.js";
import { sessionTitle } from "../osc.js";
import { registerAuthCommand } from "./auth.js";

function syncAuthHint(ctx: {
  modelRegistry: { getProviderAuthStatus: (id: string) => { configured: boolean } };
  ui: { setStatus: (key: string, text: string | undefined) => void; setTitle: (title: string) => void };
  model: { provider: string; id: string } | undefined;
}): void {
  const connected = CURATED_PROVIDERS.some((p) => ctx.modelRegistry.getProviderAuthStatus(p.piId).configured);
  ctx.ui.setStatus("mcx-auth", connected ? undefined : "/auth to connect a provider");
  if (ctx.model) {
    ctx.ui.setTitle(sessionTitle(ctx.model.provider, ctx.model.id));
  } else {
    ctx.ui.setTitle("mcx");
  }
}

export function createMcxExtension(): InlineExtension {
  return {
    name: "mcx",
    factory: (pi: ExtensionAPI) => {
      registerAuthCommand(pi);

      pi.on("session_start", (_event, ctx) => {
        syncAuthHint(ctx);
      });

      pi.on("model_select", (_event, ctx) => {
        syncAuthHint(ctx);
      });
    },
  };
}
