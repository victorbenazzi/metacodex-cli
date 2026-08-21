import { describe, expect, it } from "vitest";
import { buildHandoffPacket, isCrossProvider } from "./handoff.js";

describe("handoff packet", () => {
  const base = {
    fromProvider: "anthropic",
    fromModel: "claude-opus-4-6",
    toProvider: "deepseek",
    toModel: "deepseek-chat",
    inProgress: "refactoring auth",
    alreadyDone: "added the grant check",
    doNotRedo: "do not rewrite paths.rs",
  };

  it("always tells the destination this is a handoff, even with no user text", () => {
    const packet = buildHandoffPacket(base);
    expect(packet).toContain("This session is a handoff");
    expect(packet).toContain("Previous model: anthropic/claude-opus-4-6");
    expect(packet).toContain("Your model: deepseek/deepseek-chat");
    expect(packet).not.toContain("User instruction");
  });

  it("appends user instruction and never replaces the packet", () => {
    const packet = buildHandoffPacket({
      ...base,
      userInstruction: "finish the tests only",
    });
    expect(packet).toContain("This session is a handoff");
    expect(packet).toContain("User instruction for this handoff:");
    expect(packet).toContain("finish the tests only");
  });

  it("treats same-provider model swaps as not a handoff ceremony", () => {
    expect(isCrossProvider("anthropic", "anthropic")).toBe(false);
    expect(isCrossProvider("anthropic", "openai-codex")).toBe(true);
  });
});
