import { describe, expect, it } from "vitest";
import { MCX_TITLE } from "./brand/mark.js";
import { oscAttention, oscDone, oscTitle, sessionTitle } from "./osc.js";

describe("osc", () => {
  it("emits the sequences the metacodex app already understands", () => {
    expect(oscTitle("mcx · anthropic/opus")).toContain("\u001b]0;");
    expect(oscDone()).toContain("\u001b]9;");
    expect(oscAttention("auth failed")).toBe("\u001b]99;2;auth failed\u0007");
    expect(oscAttention("subagent failed", "scan")).toBe("\u001b]99;2;subagent failed;scan\u0007");
    expect(MCX_TITLE).toBe("metacodex");
    expect(sessionTitle("anthropic", "claude-opus-4-6")).toBe("mcx · anthropic/claude-opus-4-6");
  });
});
