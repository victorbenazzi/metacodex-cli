import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTruncationShortener } from "./truncation.js";

type Handler = (event: {
  type: string;
  toolName: string;
  details?: { fullOutputPath?: string };
}) => { details?: { fullOutputPath?: string } } | undefined;

function shorten(event: Parameters<Handler>[0]): ReturnType<Handler> {
  const handlers: Handler[] = [];
  const pi = {
    on(_event: string, handler: Handler) {
      handlers.push(handler);
    },
  };
  registerTruncationShortener(pi as unknown as ExtensionAPI);
  return handlers[0]?.(event);
}

describe("registerTruncationShortener", () => {
  it("keeps the log name and drops the OS temp directory", () => {
    expect(
      shorten({
        type: "tool_result",
        toolName: "bash",
        details: {
          fullOutputPath:
            "/var/folders/j0/ypxwv9vn0hb4h3l8g5z8g4fh0000gn/T/pi-bash-ed294e0871f45944.log",
        },
      })?.details?.fullOutputPath,
    ).toBe("pi-bash-ed294e0871f45944.log");
  });

  it("leaves results without a log path untouched", () => {
    expect(shorten({ type: "tool_result", toolName: "bash" })).toBeUndefined();
  });
});
