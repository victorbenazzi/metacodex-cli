import { describe, expect, it } from "vitest";
import { pasteKeybindingsConfig } from "./paste-keys.js";

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
