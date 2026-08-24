/**
 * Block mark traced from the metacodex app SVG
 * (`src/assets/brand/mark-dark.svg`): two commas, 180 degree rotation.
 */

import { MCX_PRODUCT } from "../version.js";

export const MCX_MARK: readonly string[] = [
  " ▄███████████▄",
  "█████████████▀",
  "███████▀██▀▀  ",
  " ▀▀▀▀█  ▄▄▄▄▄▄",
  "  ▄▄██████████",
  "▄█████████████",
  "▀███████████▀ ",
];

export const DEFAULT_THEME_SETTING = "metacodex-light/metacodex-dark";

const MARK_WIDTH = MCX_MARK[0]?.length ?? 0;
const SIDE_GAP = "  ";

export interface HeaderTheme {
  fg(color: "accent" | "muted" | "dim" | "text", text: string): string;
  bold(text: string): string;
}

function padEndVisible(text: string, width: number): string {
  if (text.length >= width) return text;
  return `${text}${" ".repeat(width - text.length)}`;
}

export function markWidth(): number {
  return MARK_WIDTH;
}

/** Uncolored header lines. Used to size the TUI layout. */
export function headerPlain(version: string): { mark: readonly string[]; title: string; tag: string } {
  return {
    mark: MCX_MARK,
    title: `${MCX_PRODUCT} ${version}`,
    tag: "one session, several wallets",
  };
}

export function renderMcxHeader(theme: HeaderTheme, version: string, width: number): string[] {
  const title = `${theme.bold(theme.fg("accent", MCX_PRODUCT))}${theme.fg("dim", ` ${version}`)}`;
  const tag = theme.fg("muted", "one session, several wallets");
  const plain = headerPlain(version);
  const sideWidth = Math.max(plain.title.length, plain.tag.length);
  const stacked = width < MARK_WIDTH + SIDE_GAP.length + sideWidth;

  const coloredMark = MCX_MARK.map((line) => theme.fg("text", padEndVisible(line, MARK_WIDTH)));
  if (stacked) {
    return ["", ...coloredMark, "", title, tag];
  }

  return [
    "",
    ...coloredMark.map((line, i) => {
      if (i === 0) return `${line}${SIDE_GAP}${title}`;
      if (i === 1) return `${line}${SIDE_GAP}${tag}`;
      return line;
    }),
  ];
}
