import { describe, expect, it } from "vitest";
import { oscAttention, oscDone, oscTitle, sessionTitle } from "./osc.js";

describe("osc", () => {
  it("emits the sequences the metacodex app already understands", () => {
    expect(oscTitle("mcx · anthropic/opus")).toContain("\u001b]0;");
    expect(oscDone()).toContain("\u001b]9;");
    expect(oscAttention("auth failed")).toContain("\u001b]99;");
    expect(sessionTitle("anthropic", "claude-opus-4-6")).toBe(
      "mcx · anthropic/claude-opus-4-6",
    );
  });
});
