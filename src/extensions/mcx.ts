import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { MCX_TITLE } from "../brand/mark.js";
import { CURATED_PROVIDERS } from "../catalog.js";
import { setEngineTitle } from "../engine/title.js";
import { sessionTitle } from "../osc.js";
import { extraSkillPaths } from "../skills/discovery.js";
import { registerAuthCommand } from "./auth.js";
import { registerClear } from "./clear.js";
import { registerEditor } from "./editor.js";
import { registerEffort } from "./effort.js";
import { registerFallback } from "./fallback.js";
import { registerHandoff } from "./handoff.js";
import { registerHeader } from "./header.js";
import { createOscBridge, registerOsc } from "./osc.js";
import { registerSkillDiscovery } from "./skills.js";
import { registerSpawn } from "./spawn.js";
import { registerTruncationShortener } from "./truncation.js";

function syncAuthHint(ctx: {
  modelRegistry: { getProviderAuthStatus: (id: string) => { configured: boolean } };
  ui: { setStatus: (key: string, text: string | undefined) => void; setTitle: (title: string) => void };
  model: { provider: string; id: string } | undefined;
}): void {
  const connected = CURATED_PROVIDERS.some((p) => ctx.modelRegistry.getProviderAuthStatus(p.piId).configured);
  ctx.ui.setStatus("mcx-auth", connected ? undefined : "/auth to connect a provider");
  if (ctx.model) {
    setEngineTitle(ctx, sessionTitle(ctx.model.provider, ctx.model.id));
  } else {
    setEngineTitle(ctx, MCX_TITLE);
  }
}

export function createMcxExtension(agentDir: string): InlineExtension {
  return {
    name: "mcx",
    factory: (pi: ExtensionAPI) => {
      const osc = createOscBridge();
      registerAuthCommand(pi, { agentDir });
      registerClear(pi);
      registerHeader(pi);
      registerEditor(pi);
      registerTruncationShortener(pi);
      registerFallback(pi, {
        agentDir,
        onAttention: (kind) => {
          osc.attention(kind);
        },
      });
      registerHandoff(pi);
      registerEffort(pi);
      registerSpawn(pi, { agentDir, writeOsc: osc.write });
      registerSkillDiscovery(pi, { discover: (cwd) => extraSkillPaths(cwd, homedir(), agentDir) });
      registerOsc(pi, osc);

      pi.on("session_start", (_event, ctx) => {
        syncAuthHint(ctx);
      });

      pi.on("model_select", (_event, ctx) => {
        syncAuthHint(ctx);
      });
    },
  };
}
