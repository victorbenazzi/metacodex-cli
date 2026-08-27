import { describe, expect, it } from "vitest";
import { isHelpArg, isVersionArg, mcxHelp } from "./help.js";

describe("mcx help", () => {
  it("intercepts help and version flags before Pi", () => {
    expect(isHelpArg(["--help"])).toBe(true);
    expect(isHelpArg(["-h"])).toBe(true);
    expect(isHelpArg(["-p", "hi"])).toBe(false);
    expect(isVersionArg(["--version"])).toBe(true);
    expect(isVersionArg(["-V"])).toBe(true);
  });

  it("prints mcx identity, not pi", () => {
    const text = mcxHelp("0.0.1");
    expect(text.startsWith("mcx 0.0.1")).toBe(true);
    expect(text).toContain("/auth");
    expect(text).toContain("/clear");
    expect(text).toContain("/effort");
    expect(text).toContain("/handoff");
    expect(text).toContain("mcx --session");
    expect(text).toContain("mcx update");
    expect(text).not.toMatch(/\bpi \[options\]/i);
  });
});

