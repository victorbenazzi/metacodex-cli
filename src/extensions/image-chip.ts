/** Pi writes clipboard images as `pi-clipboard-<uuid>.<ext>` in the temp dir. */
const CLIPBOARD_IMAGE =
  /(?:^|[\\/])pi-clipboard-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|gif|webp|bmp)$/i;

const IMAGE_CHIP = /\[Image #(\d+)\]/g;

export interface ImageChipState {
  nextId: number;
  chips: Map<number, string>;
}

export function isClipboardImagePath(text: string): boolean {
  const path = text.trim();
  if (!path || /\s/.test(path)) return false;
  return CLIPBOARD_IMAGE.test(path);
}

export function formatImageChip(id: number): string {
  return `[Image #${id}]`;
}

export function createImageChipState(): ImageChipState {
  return { nextId: 1, chips: new Map() };
}

/** Replace a clipboard image path with `[Image #N]`. Keeps leading space if Pi added one. */
export function chipClipboardImage(text: string, state: ImageChipState): string {
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const path = text.trim();
  if (!isClipboardImagePath(path)) return text;
  const id = state.nextId;
  state.nextId += 1;
  state.chips.set(id, path);
  return `${leading}${formatImageChip(id)}`;
}

export function expandImageChips(text: string, chips: ReadonlyMap<number, string>): string {
  return text.replace(IMAGE_CHIP, (match, raw: string) => chips.get(Number(raw)) ?? match);
}
