import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledThemesDir, packageRoot } from "../bootstrap.js";

const REQUIRED_COLORS = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "selectedBg",
  "userMessageBg",
  "userMessageText",
  "customMessageBg",
  "customMessageText",
  "customMessageLabel",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "bashMode",
] as const;

describe("bundled themes", () => {
  it("ships dark and light metacodex palettes with every required token", async () => {
    const dir = bundledThemesDir(packageRoot());
    const files = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    expect(files).toEqual(["metacodex-dark.json", "metacodex-light.json"]);

    for (const file of files) {
      const raw = JSON.parse(await readFile(join(dir, file), "utf8")) as {
        name: string;
        vars: Record<string, string>;
        colors: Record<string, string>;
      };
      expect(raw.name).toBe(file.replace(/\.json$/, ""));
      expect(raw.vars.orange).toBe("#f54e00");
      for (const key of REQUIRED_COLORS) {
        expect(raw.colors[key], `${file} missing ${key}`).toBeTruthy();
      }
    }
  });
});
