import { basename } from "node:path";
import { isBashToolResult, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Keep the log name in the TUI. Drop the OS temp directory prefix. */
export function displayTempOutputPath(path: string): string {
  return basename(path);
}

export function registerTruncationShortener(pi: ExtensionAPI): void {
  pi.on("tool_result", (event) => {
    if (!isBashToolResult(event)) return;
    const full = event.details?.fullOutputPath;
    if (!full) return;
    return {
      details: {
        ...event.details,
        fullOutputPath: displayTempOutputPath(full),
      },
    };
  });
}
