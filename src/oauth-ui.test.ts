import { describe, expect, it } from "vitest";
import { hyperlink, oauthWidgetLines, wrapText } from "./oauth-ui.js";

describe("oauth widget", () => {
  it("wraps a long URL so the TUI can show every character", () => {
    const url = "https://claude.ai/oauth/authorize?".padEnd(180, "x");
    const lines = wrapText(url, 40);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(url);
  });

  it("puts a clickable hint above the wrapped URL", () => {
    const url = "https://claude.ai/oauth/authorize?code=1";
    const lines = oauthWidgetLines(url, "Complete login in your browser.");
    expect(lines[0]).toBe("Complete login in your browser.");
    expect(lines.some((line) => line.includes(url.slice(0, 32)))).toBe(true);
    expect(hyperlink(url, "Open")).toContain(url);
  });
});
