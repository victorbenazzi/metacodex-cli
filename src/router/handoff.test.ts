import { describe, expect, it } from "vitest";
import { parseProviderModel } from "../catalog.js";
import {
  buildHandoffPacket,
  deriveHandoffFields,
  formatHandoffOption,
  hasConversationTurns,
  isCrossProvider,
  listHandoffTargets,
  shouldCompactForHandoff,
} from "./handoff.js";

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

describe("handoff selector rows", () => {
  it("round-trips provider/id from the select label", () => {
    const row = formatHandoffOption({
      provider: "deepseek",
      id: "deepseek-chat",
      name: "DeepSeek Chat",
    });
    expect(parseProviderModel(row)).toEqual({ provider: "deepseek", id: "deepseek-chat" });
    expect(parseProviderModel("not-a-model")).toBeUndefined();
  });
});

describe("listHandoffTargets", () => {
  it("keeps curated models and drops the current one", () => {
    const models = [
      { provider: "anthropic", id: "opus" },
      { provider: "deepseek", id: "deepseek-chat" },
      { provider: "openrouter", id: "hidden" },
    ];
    expect(listHandoffTargets(models, { provider: "anthropic", id: "opus" })).toEqual([
      { provider: "deepseek", id: "deepseek-chat" },
    ]);
  });
});

describe("shouldCompactForHandoff", () => {
  it("compacts only when the destination window is smaller", () => {
    expect(shouldCompactForHandoff(200_000, 64_000)).toBe(true);
    expect(shouldCompactForHandoff(64_000, 200_000)).toBe(false);
    expect(shouldCompactForHandoff(200_000, 200_000)).toBe(false);
  });
});

describe("deriveHandoffFields", () => {
  it("uses the last user prompt and lists write/edit work", () => {
    const fields = deriveHandoffFields([
      { role: "user", content: "add the grant check" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "editing" },
          {
            type: "toolCall",
            name: "edit",
            arguments: { path: "src-tauri/src/util/paths.rs" },
          },
        ],
      },
      { role: "user", content: "now cover the fallback hop" },
    ]);
    expect(fields.inProgress).toBe("now cover the fallback hop");
    expect(fields.alreadyDone).toContain("edit src-tauri/src/util/paths.rs");
    expect(fields.doNotRedo).toContain("src-tauri/src/util/paths.rs");
  });

  it("stays specified-empty when the transcript has no user turn yet", () => {
    expect(deriveHandoffFields([])).toEqual({
      inProgress: "(not specified)",
      alreadyDone: "(not specified)",
      doNotRedo: "(see already done)",
    });
  });
});

describe("hasConversationTurns", () => {
  it("ignores empty threads, handoff packets, and non-chat roles", () => {
    expect(hasConversationTurns([])).toBe(false);
    expect(hasConversationTurns([{ role: "system", content: "skill prompt" }])).toBe(false);
    expect(
      hasConversationTurns([
        { role: "user", content: "This session is a handoff. You are taking over an in-flight coding task." },
      ]),
    ).toBe(false);
  });

  it("counts a user prompt or assistant tool work", () => {
    expect(hasConversationTurns([{ role: "user", content: "cover the hop" }])).toBe(true);
    expect(
      hasConversationTurns([
        {
          role: "assistant",
          content: [{ type: "toolCall", name: "read", arguments: { path: "src/cli.ts" } }],
        },
      ]),
    ).toBe(true);
  });
});
