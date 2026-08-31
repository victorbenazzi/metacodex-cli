import { describe, expect, it, vi } from "vitest";
import {
  applyGhosttyThemeContrastWorkaround,
  parseAutoThemePair,
  parseOsc11Background,
  parseTerminalAppearance,
} from "./theme.js";

describe("Ghostty theme contrast workaround", () => {
  it("parses Ghostty 16-bit OSC 11 and a conflicting light scheme report", () => {
    const report = "\x1b]11;rgb:1414/1414/1212\x07\x1b[?997;2n";
    expect(parseTerminalAppearance(report)).toEqual({
      background: "dark",
      colorScheme: "light",
    });
  });

  it("parses 8-bit and hash OSC 11 colors", () => {
    expect(parseOsc11Background("rgb:f7/f7/f4")).toEqual({ r: 247, g: 247, b: 244 });
    expect(parseOsc11Background("#141412")).toEqual({ r: 20, g: 20, b: 18 });
  });

  it("uses the theme matching the rendered background when Ghostty reports a conflict", async () => {
    const argv = await applyGhosttyThemeContrastWorkaround(
      [],
      "metacodex-light/metacodex-dark",
      {
        platform: "linux",
        env: { TERM_PROGRAM: "ghostty" },
        queryAppearance: async () => ({ background: "dark", colorScheme: "light" }),
      },
    );
    expect(argv).toEqual(["--use-theme", "metacodex-dark"]);
  });

  it("keeps automatic switching when both terminal reports agree", async () => {
    const argv = await applyGhosttyThemeContrastWorkaround(
      ["--continue"],
      "metacodex-light/metacodex-dark",
      {
        platform: "linux",
        env: { TERM_PROGRAM: "ghostty" },
        queryAppearance: async () => ({ background: "dark", colorScheme: "dark" }),
      },
    );
    expect(argv).toEqual(["--continue"]);
  });

  it("does not query other terminals or replace an explicit CLI theme", async () => {
    const queryAppearance = vi.fn(async () => ({ background: "dark" as const, colorScheme: "light" as const }));
    await expect(
      applyGhosttyThemeContrastWorkaround([], "light/dark", {
        platform: "linux",
        env: { TERM_PROGRAM: "kitty" },
        queryAppearance,
      }),
    ).resolves.toEqual([]);
    await expect(
      applyGhosttyThemeContrastWorkaround(["--use-theme", "light"], "light/dark", {
        platform: "linux",
        env: { TERM_PROGRAM: "ghostty" },
        queryAppearance,
      }),
    ).resolves.toEqual(["--use-theme", "light"]);
    expect(queryAppearance).not.toHaveBeenCalled();
  });

  it("parses only complete automatic theme pairs", () => {
    expect(parseAutoThemePair(" porcelain / graphite ")).toEqual({
      lightTheme: "porcelain",
      darkTheme: "graphite",
    });
    expect(parseAutoThemePair("dark")).toBeUndefined();
    expect(parseAutoThemePair("a/b/c")).toBeUndefined();
  });
});
