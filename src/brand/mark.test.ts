import { describe, expect, it } from "vitest";
import { MCX_MARK, headerPlain, markWidth, renderMcxHeader } from "./mark.js";

const theme = {
  fg: (_color: "accent" | "muted" | "dim" | "text", text: string) => text,
  bold: (text: string) => text,
};

describe("MCX_MARK", () => {
  it("is a rectangular block of the two-comma mark", () => {
    const width = markWidth();
    expect(width).toBeGreaterThan(8);
    expect(MCX_MARK).toHaveLength(7);
    for (const line of MCX_MARK) {
      expect(line).toHaveLength(width);
    }
    const ink = MCX_MARK.join("");
    expect(ink).toMatch(/[█▀▄]/);
  });
});

describe("renderMcxHeader", () => {
  it("puts the name beside the mark when the terminal is wide enough", () => {
    const plain = headerPlain("0.0.1");
    const width = markWidth() + 2 + Math.max(plain.title.length, plain.tag.length);
    const lines = renderMcxHeader(theme, "0.0.1", width);
    expect(lines[0]).toBe("");
    expect(lines[1]).toContain("metacodex-cli 0.0.1");
    expect(lines[2]).toContain("one session, several wallets");
    expect(lines[1]?.startsWith(MCX_MARK[0] ?? "")).toBe(true);
  });

  it("stacks name under the mark on a narrow terminal", () => {
    const lines = renderMcxHeader(theme, "0.0.1", markWidth());
    expect(lines.at(-2)).toBe("metacodex-cli 0.0.1");
    expect(lines.at(-1)).toBe("one session, several wallets");
    expect(lines).toContain(MCX_MARK[0]);
  });
});
