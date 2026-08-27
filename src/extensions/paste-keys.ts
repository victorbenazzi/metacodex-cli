/** Platform default keys for `app.clipboard.pasteImage`, as a keybindings.json entry. */
export function pasteKeybindingsConfig(platform = process.platform): Record<string, string[]> {
  if (platform === "win32") return { "app.clipboard.pasteImage": ["alt+v"] };
  if (platform === "darwin") return { "app.clipboard.pasteImage": ["ctrl+v", "super+v"] };
  return { "app.clipboard.pasteImage": ["ctrl+v"] };
}
