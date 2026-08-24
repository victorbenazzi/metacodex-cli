import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSkillDiscovery } from "./skills.js";

type Handler = (event: { cwd: string; reason: string }) => { skillPaths?: string[] } | undefined;

function createHarness(discover: (cwd: string) => string[]) {
  const handlers: Handler[] = [];
  const pi = {
    on(event: string, handler: Handler) {
      if (event === "resources_discover") handlers.push(handler);
    },
  };
  registerSkillDiscovery(pi as unknown as ExtensionAPI, { discover });
  return {
    emit(cwd: string) {
      return handlers[0]?.({ cwd, reason: "startup" });
    },
  };
}

describe("registerSkillDiscovery", () => {
  it("returns existing extra skill dirs and omits an empty result", () => {
    const found = createHarness(() => ["/tmp/claude/skills"]);
    expect(found.emit("/work")).toEqual({ skillPaths: ["/tmp/claude/skills"] });

    const empty = createHarness(() => []);
    expect(empty.emit("/work")).toBeUndefined();
  });
});
