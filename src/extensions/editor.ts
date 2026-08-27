import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { chipClipboardImage, createImageChipState, expandImageChips } from "./image-chip.js";

/**
 * Editor that shows Pi clipboard image dumps as `[Image #N]` chips.
 * `getExpandedText` swaps the chips back for real paths on submit,
 * mirroring how pi-tui expands its own `[paste #N]` markers.
 */
export class McxEditor extends CustomEditor {
  private readonly images = createImageChipState();

  override getExpandedText(): string {
    return expandImageChips(super.getExpandedText(), this.images.chips);
  }

  override insertTextAtCursor(text: string): void {
    super.insertTextAtCursor(chipClipboardImage(text, this.images));
  }
}

export function registerEditor(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new McxEditor(tui, theme, keybindings));
  });
}
