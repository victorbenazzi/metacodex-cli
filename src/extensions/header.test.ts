import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MCX_MARK } from "../brand/mark.js";
import { registerHeader } from "./header.js";

type Handler = (_event: unknown, ctx: ExtensionContext) => void;

function createHarness() {
  const handlers: Handler[] = [];
  let header:
    | {
        render(width: number): string[];
      }
    | undefined;

  const ctx = {
    mode: "tui" as "tui" | "print",
    ui: {
      setHeader(factory: (tui: unknown, theme: { fg: (c: string, t: string) => string; bold: (t: string) => string }) => { render(width: number): string[] }) {
        header = factory(undefined, {
          fg: (_c: string, t: string) => t,
          bold: (t: string) => t,
        });
      },
    },
  };

  const pi = {
    on(event: string, handler: Handler) {
      if (event === "session_start") handlers.push(handler);
    },
  };

  registerHeader(pi as unknown as ExtensionAPI);
  return {
    header: () => header,
    emit(mode: "tui" | "print" = "tui") {
      ctx.mode = mode;
      for (const handler of handlers) handler({}, ctx as unknown as ExtensionContext);
    },
  };
}

describe("registerHeader", () => {
  it("installs the mark header in TUI mode and skips print mode", () => {
    const harness = createHarness();
    harness.emit("print");
    expect(harness.header()).toBeUndefined();

    harness.emit("tui");
    const lines = harness.header()?.render(80) ?? [];
    expect(lines.some((line) => line.includes(MCX_MARK[0] ?? ""))).toBe(true);
    expect(lines.some((line) => line.includes("metacodex-cli"))).toBe(true);
  });
});
