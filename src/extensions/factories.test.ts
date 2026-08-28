import { describe, expect, it } from "vitest";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { createChildFallbackExtension } from "./spawn.js";
import { createParentExtensions } from "./factories.js";
import { MCP_EXTENSION_NAME } from "./mcp.js";

function extensionNames(extensions: readonly InlineExtension[]): string[] {
  return extensions.map((ext) => (typeof ext === "function" ? "<inline>" : ext.name));
}

describe("createParentExtensions", () => {
  it("loads mcx and the MCP adapter factory on the parent session", () => {
    const mcp = (): void => {};
    expect(extensionNames(createParentExtensions("/tmp/mcx-home", mcp))).toEqual(["mcx", MCP_EXTENSION_NAME]);
  });

  it("does not put MCP on the child session", () => {
    const child = createChildFallbackExtension("/tmp/mcx-home");
    expect(extensionNames([child])).toEqual(["mcx-child-fallback"]);
    expect(extensionNames([child])).not.toContain(MCP_EXTENSION_NAME);
  });
});
