import { describe, expect, it } from "vitest";
import { bundledKeybindingsConfig, pasteKeybindingsConfig, THINKING_CYCLE_KEYBINDING } from "./paste-keys.js";

describe("pasteKeybindingsConfig", () => {
  it("uses Command and Ctrl on macOS, Alt on Windows, Ctrl on Linux", () => {
    expect(pasteKeybindingsConfig("darwin")).toEqual({
      "app.clipboard.pasteImage": ["ctrl+v", "super+v"],
    });
    expect(pasteKeybindingsConfig("win32")).toEqual({
      "app.clipboard.pasteImage": ["alt+v"],
    });
    expect(pasteKeybindingsConfig("linux")).toEqual({
      "app.clipboard.pasteImage": ["ctrl+v"],
    });
  });
});

describe("bundledKeybindingsConfig", () => {
  it("keeps paste keys and frees Shift+Tab from thinking cycle", () => {
    const bundled = bundledKeybindingsConfig("darwin");
    expect(bundled["app.clipboard.pasteImage"]).toEqual(["ctrl+v", "super+v"]);
    expect(bundled[THINKING_CYCLE_KEYBINDING]).toEqual([]);
  });
});
