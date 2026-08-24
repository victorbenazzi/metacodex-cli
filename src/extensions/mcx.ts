import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { CURATED_PROVIDERS } from "../catalog.js";
import { MCX_TITLE, sessionTitle } from "../osc.js";
import { registerAuthCommand } from "./auth.js";
import { registerEditor } from "./editor.js";
import { registerFallback } from "./fallback.js";
import { registerHandoff } from "./handoff.js";
import { registerHeader } from "./header.js";
import { createOscBridge, registerOsc } from "./osc.js";
import { createSelectPacketGate } from "./select-packet.js";
import { registerSkillDiscovery } from "./skills.js";
import { registerSpawn } from "./spawn.js";
import { registerTruncationShortener } from "./truncation.js";

function setMcxTitle(ctx: { ui: { setTitle: (title: string) => void } }, title: string): void {
  ctx.ui.setTitle(title);
  // Pi restores its default title after session_start. Reapply ours on the next turn.
  setTimeout(() => ctx.ui.setTitle(title), 0);
}

function syncAuthHint(ctx: {
  modelRegistry: { getProviderAuthStatus: (id: string) => { configured: boolean } };
  ui: { setStatus: (key: string, text: string | undefined) => void; setTitle: (title: string) => void };
  model: { provider: string; id: string } | undefined;
}): void {
  const connected = CURATED_PROVIDERS.some((p) => ctx.modelRegistry.getProviderAuthStatus(p.piId).configured);
  ctx.ui.setStatus("mcx-auth", connected ? undefined : "/auth to connect a provider");
  if (ctx.model) {
    setMcxTitle(ctx, sessionTitle(ctx.model.provider, ctx.model.id));
  } else {
    setMcxTitle(ctx, MCX_TITLE);
  }
}

export function createMcxExtension(): InlineExtension {
  return {
    name: "mcx",
    factory: (pi: ExtensionAPI) => {
      const osc = createOscBridge();
      const selectPacketGate = createSelectPacketGate();
      registerAuthCommand(pi);
      registerHeader(pi);
      registerEditor(pi);
      registerTruncationShortener(pi);
      registerFallback(pi, {
        onAttention: (kind) => {
          osc.attention(kind);
        },
        selectPacketGate,
      });
      registerHandoff(pi, { selectPacketGate });
      registerSpawn(pi, { writeOsc: osc.write });
      registerSkillDiscovery(pi);
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
