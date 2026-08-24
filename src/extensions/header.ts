import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderMcxHeader } from "../brand/mark.js";
import { MCX_VERSION } from "../version.js";

export function registerHeader(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((_tui, theme) => ({
      render(width: number) {
        return renderMcxHeader(theme, MCX_VERSION, width);
      },
      invalidate() {},
    }));
  });
}
