/** Platform paste keys for `app.clipboard.pasteImage`. */
export function defaultPasteImageKeys(platform = process.platform): string[] {
  if (platform === "darwin") return ["ctrl+v", "super+v"];
  if (platform === "win32") return ["alt+v"];
  return ["ctrl+v"];
}

export function pasteKeybindingsConfig(platform = process.platform): Record<string, string[]> {
  return {
    "app.clipboard.pasteImage": defaultPasteImageKeys(platform),
  };
}
