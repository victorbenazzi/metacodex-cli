import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Same path as Pi's built-in `/new`. */
export async function runClearCommand(ctx: ExtensionCommandContext): Promise<void> {
  await ctx.newSession({
    withSession: async (next) => {
      next.ui.notify("New session started", "info");
    },
  });
}

export function registerClear(pi: ExtensionAPI): void {
  pi.registerCommand("clear", {
    description: "Start a new session. Same as /new",
    handler: async (_args, ctx) => {
      await runClearCommand(ctx);
    },
  });
}
