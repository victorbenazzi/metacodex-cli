import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { chipClipboardImage, createImageChipState, expandImageChips, type ImageChipState } from "./image-chip.js";

type PasteExpander = { expandPasteMarkers: (text: string) => string };

export class McxEditor extends CustomEditor {
  private readonly images: ImageChipState = createImageChipState();
  private expanderPatched = false;

  private ensureExpander(): void {
    if (this.expanderPatched) return;
    this.expanderPatched = true;
    const self = this as unknown as PasteExpander;
    const original = self.expandPasteMarkers.bind(this);
    self.expandPasteMarkers = (text: string) => expandImageChips(original(text), this.images.chips);
  }

  override insertTextAtCursor(text: string): void {
    this.ensureExpander();
    super.insertTextAtCursor(chipClipboardImage(text, this.images));
  }
}

export function registerEditor(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new McxEditor(tui, theme, keybindings));
  });
}
