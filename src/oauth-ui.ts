import { spawn } from "node:child_process";

const OSC_OPEN = "\u001b]8;;";
const OSC_CLOSE = "\u001b]8;;\u0007";
const BEL = "\u0007";

export function wrapText(text: string, width = 72): string[] {
  if (width < 8) return [text];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.slice(i, i + width));
  }
  return lines;
}

export function hyperlink(url: string, label: string): string {
  return `${OSC_OPEN}${url}${BEL}${label}${OSC_CLOSE}`;
}

export function oauthWidgetLines(url: string, instructions?: string): string[] {
  const click = process.platform === "darwin" ? "Cmd+click to open" : "Ctrl+click to open";
  return [
    instructions?.trim() || "Complete login in your browser.",
    hyperlink(url, click),
    ...wrapText(url),
    "If the browser is on another machine, paste the redirect URL in the prompt.",
  ];
}

export function deviceCodeWidgetLines(input: { userCode: string; verificationUri: string }): string[] {
  const click = process.platform === "darwin" ? "Cmd+click to open" : "Ctrl+click to open";
  return [
    `Enter code: ${input.userCode}`,
    hyperlink(input.verificationUri, click),
    ...wrapText(input.verificationUri),
  ];
}

export function openUrl(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}
