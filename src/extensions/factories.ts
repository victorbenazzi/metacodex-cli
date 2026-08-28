import type { ExtensionFactory, InlineExtension } from "@earendil-works/pi-coding-agent";
import { createMcxExtension } from "./mcx.js";
import { MCP_EXTENSION_NAME } from "./mcp.js";

export function createParentExtensions(agentDir: string, mcpFactory: ExtensionFactory): InlineExtension[] {
  return [createMcxExtension(agentDir), { name: MCP_EXTENSION_NAME, factory: mcpFactory }];
}
