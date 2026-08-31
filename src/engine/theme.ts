import type { ReadStream, WriteStream } from "node:tty";

export type TerminalThemeKind = "light" | "dark";

export interface TerminalAppearance {
  background?: TerminalThemeKind;
  colorScheme?: TerminalThemeKind;
}

interface ThemePair {
  lightTheme: string;
  darkTheme: string;
}

interface ThemeWorkaroundOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  queryAppearance?: () => Promise<TerminalAppearance>;
}

const OSC_11_QUERY = "\x1b]11;?\x07";
const COLOR_SCHEME_QUERY = "\x1b[?996n";
const OSC_11_RESPONSE = /\x1b\]11;([^\x07\x1b]*)(?:\x07|\x1b\\)/i;
const COLOR_SCHEME_RESPONSE = /\x1b\[\?997;(1|2)n/;

function parseHexChannel(channel: string): number | undefined {
  if (!/^[0-9a-f]+$/i.test(channel)) return undefined;
  const max = 16 ** channel.length - 1;
  if (max <= 0) return undefined;
  return Math.round((Number.parseInt(channel, 16) / max) * 255);
}

export function parseOsc11Background(value: string): { r: number; g: number; b: number } | undefined {
  const normalized = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
    };
  }

  const rgb = normalized.replace(/^rgba?:/i, "").split("/");
  if (rgb.length < 3) return undefined;
  const r = parseHexChannel(rgb[0] ?? "");
  const g = parseHexChannel(rgb[1] ?? "");
  const b = parseHexChannel(rgb[2] ?? "");
  return r === undefined || g === undefined || b === undefined ? undefined : { r, g, b };
}

function rgbTheme({ r, g, b }: { r: number; g: number; b: number }): TerminalThemeKind {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance >= 0.5 ? "light" : "dark";
}

export function parseTerminalAppearance(data: string): TerminalAppearance {
  const osc = data.match(OSC_11_RESPONSE);
  const scheme = data.match(COLOR_SCHEME_RESPONSE);
  const background = osc ? parseOsc11Background(osc[1] ?? "") : undefined;
  const appearance: TerminalAppearance = {};
  if (background) appearance.background = rgbTheme(background);
  if (scheme) appearance.colorScheme = scheme[1] === "2" ? "light" : "dark";
  return appearance;
}

function stripAppearanceResponses(data: Buffer): Buffer {
  const stripped = data
    .toString("latin1")
    .replace(new RegExp(OSC_11_RESPONSE.source, "gi"), "")
    .replace(new RegExp(COLOR_SCHEME_RESPONSE.source, "g"), "");
  return Buffer.from(stripped, "latin1");
}

/** Query both reports before Pi starts. Any unrelated input is returned to stdin. */
export async function queryTerminalAppearance(
  stdin: ReadStream = process.stdin,
  stdout: WriteStream = process.stdout,
  timeoutMs = 160,
): Promise<TerminalAppearance> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") return {};

  const chunks: Buffer[] = [];
  const wasPaused = stdin.isPaused();
  const wasRaw = stdin.isRaw;

  return new Promise<TerminalAppearance>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      stdin.pause();
      stdin.off("data", onData);
      try {
        stdin.setRawMode(wasRaw);
      } catch {
        // The PTY may have closed during the query.
      }

      const captured = Buffer.concat(chunks);
      const appearance = parseTerminalAppearance(captured.toString("latin1"));
      const unrelated = stripAppearanceResponses(captured);
      if (unrelated.length > 0 && !stdin.readableEnded) stdin.unshift(unrelated);
      if (!wasPaused) stdin.resume();
      resolve(appearance);
    };

    const onData = (chunk: Buffer | string): void => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const appearance = parseTerminalAppearance(Buffer.concat(chunks).toString("latin1"));
      if (appearance.background && appearance.colorScheme) finish();
    };

    try {
      stdin.setRawMode(true);
      stdin.on("data", onData);
      stdin.resume();
      timer = setTimeout(finish, timeoutMs);
      stdout.write(`${OSC_11_QUERY}${COLOR_SCHEME_QUERY}`);
    } catch {
      finish();
    }
  });
}

export function parseAutoThemePair(setting: unknown): ThemePair | undefined {
  if (typeof setting !== "string") return undefined;
  const slash = setting.indexOf("/");
  if (slash < 0 || setting.indexOf("/", slash + 1) >= 0) return undefined;
  const lightTheme = setting.slice(0, slash).trim();
  const darkTheme = setting.slice(slash + 1).trim();
  return lightTheme && darkTheme ? { lightTheme, darkTheme } : undefined;
}

function hasThemeOverride(argv: readonly string[]): boolean {
  return argv.some((arg) => arg === "--use-theme" || arg.startsWith("--use-theme="));
}

/**
 * Ghostty 1.3.1 can report the desktop scheme instead of its rendered background.
 * Pi 0.84.x trusts that report first, selecting light text colors for a dark terminal.
 */
export async function applyGhosttyThemeContrastWorkaround(
  argv: readonly string[],
  themeSetting: unknown,
  options: ThemeWorkaroundOptions = {},
): Promise<string[]> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const pair = parseAutoThemePair(themeSetting);
  if (
    platform !== "linux" ||
    env.TERM_PROGRAM?.toLowerCase() !== "ghostty" ||
    !pair ||
    hasThemeOverride(argv)
  ) {
    return [...argv];
  }

  const appearance = await (options.queryAppearance ?? queryTerminalAppearance)();
  if (
    !appearance.background ||
    !appearance.colorScheme ||
    appearance.background === appearance.colorScheme
  ) {
    return [...argv];
  }

  const theme = appearance.background === "light" ? pair.lightTheme : pair.darkTheme;
  return [...argv, "--use-theme", theme];
}
