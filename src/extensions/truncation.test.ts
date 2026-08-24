import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { displayTempOutputPath, registerTruncationShortener } from "./truncation.js";

describe("displayTempOutputPath", () => {
  it("keeps the log name and drops the OS temp directory", () => {
    expect(
      displayTempOutputPath(
        "/var/folders/j0/ypxwv9vn0hb4h3l8g5z8g4fh0000gn/T/pi-bash-ed294e0871f45944.log",
      ),
    ).toBe("pi-bash-ed294e0871f45944.log");
  });
});

describe("registerTruncationShortener", () => {
  it("shortens bash fullOutputPath in the TUI details", () => {
    type Handler = (event: {
      type: string;
      toolName: string;
      details?: { fullOutputPath?: string };
    }) => { details?: { fullOutputPath?: string } } | undefined;
    const handlers: Handler[] = [];
    const pi = {
      on(_event: string, handler: Handler) {
        handlers.push(handler);
      },
    };
    registerTruncationShortener(pi as unknown as ExtensionAPI);
    const result = handlers[0]?.({
      type: "tool_result",
      toolName: "bash",
      details: {
        fullOutputPath: "/tmp/pi-bash-abc.log",
      },
    });
    expect(result?.details?.fullOutputPath).toBe("pi-bash-abc.log");
  });
});
