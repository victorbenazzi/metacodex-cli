import { describe, expect, it } from "vitest";
import { isEngineUpdateArg, isHelpArg, isVersionArg, mcxHelp, mcxUpdateRejected } from "./help.js";

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
    expect(text).toContain("/handoff");
    expect(text).toContain("mcx --session");
    expect(text).not.toMatch(/\bpi \[options\]/i);
  });

  it("blocks pi update so people bump mcx instead", () => {
    expect(isEngineUpdateArg(["update"])).toBe(true);
    expect(isEngineUpdateArg(["update", "--self"])).toBe(true);
    expect(isEngineUpdateArg(["-p", "hi"])).toBe(false);
    expect(mcxUpdateRejected()).toContain("pins the Pi engine");
    expect(mcxUpdateRejected()).not.toContain("pi update --self");
  });
});

