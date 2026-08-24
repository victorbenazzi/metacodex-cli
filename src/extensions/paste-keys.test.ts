import { describe, expect, it } from "vitest";
import { defaultPasteImageKeys, pasteKeybindingsConfig } from "./paste-keys.js";

describe("defaultPasteImageKeys", () => {
  it("uses Command and Ctrl on macOS, Alt on Windows, Ctrl on Linux", () => {
    expect(defaultPasteImageKeys("darwin")).toEqual(["ctrl+v", "super+v"]);
    expect(defaultPasteImageKeys("win32")).toEqual(["alt+v"]);
    expect(defaultPasteImageKeys("linux")).toEqual(["ctrl+v"]);
    expect(pasteKeybindingsConfig("darwin")).toEqual({
      "app.clipboard.pasteImage": ["ctrl+v", "super+v"],
    });
  });
});
