import { describe, expect, it } from "vitest";
import { rewriteResumeHint } from "./resume.js";

describe("rewriteResumeHint", () => {
  it("turns Pi resume lines into mcx resume lines", () => {
    expect(rewriteResumeHint("To resume this session: pi --session 01abc")).toBe(
      "To resume this session: mcx --session 01abc",
    );
    expect(rewriteResumeHint("pi --session-dir /tmp/s pi --session 01abc")).toBe(
      "mcx --session-dir /tmp/s mcx --session 01abc",
    );
  });
});
