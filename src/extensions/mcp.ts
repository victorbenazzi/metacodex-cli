import { createRequire } from "node:module";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti/static";

export const MCP_EXTENSION_NAME = "mcp";

type McpAdapterModule = {
  createMcpAdapter: () => ExtensionFactory;
};

function isMcpAdapterModule(mod: unknown): mod is McpAdapterModule {
  return !!mod && typeof mod === "object" && "createMcpAdapter" in mod && typeof mod.createMcpAdapter === "function";
}

/** Absolute path to the adapter entry. The published export is index.ts. */
export function resolveMcpAdapterEntry(requireFn = createRequire(import.meta.url)): string {
  return requireFn.resolve("pi-mcp-adapter");
}

async function defaultLoad(): Promise<unknown> {
  // Node refuses to strip types under node_modules
  // (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). Load the .ts export with
  // jiti, the same runtime Pi uses for TypeScript extensions.
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  return jiti.import(resolveMcpAdapterEntry()) as Promise<unknown>;
}

export async function loadMcpAdapterFactory(
  load: () => Promise<unknown> = defaultLoad,
): Promise<ExtensionFactory> {
  const mod = await load();
  if (!isMcpAdapterModule(mod)) {
    throw new Error("pi-mcp-adapter did not export a factory");
  }
  const factory = mod.createMcpAdapter();
  if (typeof factory !== "function") {
    throw new Error("pi-mcp-adapter did not export a factory");
  }
  return factory;
}
