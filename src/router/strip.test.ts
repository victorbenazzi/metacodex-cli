import { describe, expect, it } from "vitest";
import { stripForProvider, type RouterMessage } from "./strip.js";

describe("stripForProvider", () => {
  it("drops cache_control and thinking blocks, keeps text and tool results", () => {
    const messages: RouterMessage[] = [
      {
        role: "assistant",
        reasoning: { tokens: 12 },
        content: [
          { type: "thinking", thinking: "secret" },
          {
            type: "text",
            text: "hello",
            cache_control: { type: "ephemeral" },
          },
          { type: "toolResult", toolCallId: "1", text: "ok" },
        ],
      },
    ];

    const stripped = stripForProvider(messages);
    expect(stripped[0]?.reasoning).toBeUndefined();
    expect(stripped[0]?.content).toEqual([
      { type: "text", text: "hello" },
      { type: "toolResult", toolCallId: "1", text: "ok" },
    ]);
  });

  it("keeps tool calls and drops provider signatures", () => {
    const messages: RouterMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "call it", textSignature: "sig" },
          { type: "toolCall", id: "t1", name: "read", thoughtSignature: "gemini" },
        ],
      },
    ];
    expect(stripForProvider(messages)[0]?.content).toEqual([
      { type: "text", text: "call it" },
      { type: "toolCall", id: "t1", name: "read" },
    ]);
  });

  it("does not mutate the original transcript", () => {
    const messages: RouterMessage[] = [
      {
        role: "assistant",
        content: [{ type: "text", text: "x", cache_control: { type: "ephemeral" } }],
      },
    ];
    stripForProvider(messages);
    const block = messages[0]?.content;
    expect(Array.isArray(block) && "cache_control" in block[0]!).toBe(true);
  });
});
