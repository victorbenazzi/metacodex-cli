import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerEditor } from "./editor.js";

describe("registerEditor", () => {
  it("installs the image-chip editor in TUI mode and skips print mode", () => {
    const handlers: Array<(_event: unknown, ctx: ExtensionContext) => void> = [];
    let factory: unknown;
    const ctx = {
      mode: "tui" as "tui" | "print",
      ui: {
        setEditorComponent(next: unknown) {
          factory = next;
        },
      },
    };
    const pi = {
      on(event: string, handler: (_event: unknown, ctx: ExtensionContext) => void) {
        if (event === "session_start") handlers.push(handler);
      },
    };
    registerEditor(pi as unknown as ExtensionAPI);
    ctx.mode = "print";
    for (const handler of handlers) handler({}, ctx as unknown as ExtensionContext);
    expect(factory).toBeUndefined();

    ctx.mode = "tui";
    for (const handler of handlers) handler({}, ctx as unknown as ExtensionContext);
    expect(typeof factory).toBe("function");
  });
});
