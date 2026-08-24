import { describe, expect, it } from "vitest";
import {
  chipClipboardImage,
  createImageChipState,
  expandImageChips,
  formatImageChip,
  isClipboardImagePath,
} from "./image-chip.js";

const macTmp =
  "/var/folders/j0/ypxwv9vn0hb4h3l8g5z8g4fh0000gn/T/pi-clipboard-bfbb53e8-bf31-489a-965d-86abb4954d24.png";

describe("isClipboardImagePath", () => {
  it("accepts Pi clipboard image dumps and rejects ordinary paths", () => {
    expect(isClipboardImagePath(macTmp)).toBe(true);
    expect(isClipboardImagePath(` ${macTmp}`)).toBe(true);
    expect(isClipboardImagePath("/tmp/photo.png")).toBe(false);
    expect(isClipboardImagePath("pi-clipboard-not-a-uuid.png")).toBe(false);
    expect(isClipboardImagePath(`${macTmp} extra`)).toBe(false);
  });
});

describe("chipClipboardImage", () => {
  it("turns a clipboard dump into [Image #N] and expands it back", () => {
    const state = createImageChipState();
    expect(chipClipboardImage(macTmp, state)).toBe("[Image #1]");
    expect(chipClipboardImage(` ${macTmp}`, state)).toBe(" [Image #2]");
    expect(chipClipboardImage("hello", state)).toBe("hello");
    expect(formatImageChip(1)).toBe("[Image #1]");
    expect(expandImageChips("see [Image #1] and [Image #2]", state.chips)).toBe(
      `see ${macTmp} and ${macTmp}`,
    );
    expect(expandImageChips("[Image #9]", state.chips)).toBe("[Image #9]");
  });
});
