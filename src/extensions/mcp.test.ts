import { describe, expect, it } from "vitest";
import { loadMcpAdapterFactory, resolveMcpAdapterEntry } from "./mcp.js";

describe("loadMcpAdapterFactory", () => {
  it("loads createMcpAdapter from the injected importer", async () => {
    const inner = (): void => {};
    const factory = await loadMcpAdapterFactory(async () => ({
      createMcpAdapter: () => inner,
    }));
    expect(factory).toBe(inner);
  });

  it("throws when the package has no factory", async () => {
    await expect(loadMcpAdapterFactory(async () => ({}))).rejects.toThrow(/factory/);
    await expect(loadMcpAdapterFactory(async () => null)).rejects.toThrow(/factory/);
  });

  it("points at the adapter TypeScript entry under node_modules", () => {
    expect(resolveMcpAdapterEntry().replaceAll("\\", "/")).toMatch(/\/pi-mcp-adapter\/index\.ts$/);
  });

  it("resolves the pinned pi-mcp-adapter package", async () => {
    const factory = await loadMcpAdapterFactory();
    expect(typeof factory).toBe("function");
  });
});
