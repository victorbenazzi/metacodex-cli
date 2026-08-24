import { describe, expect, it } from "vitest";
import { hideUncuratedCatalog } from "./catalog-runtime.js";

describe("hideUncuratedCatalog", () => {
  it("filters ModelRuntime availability to curated providers", async () => {
    class FakeRuntime {
      getAvailableSnapshot() {
        return [
          { provider: "anthropic", id: "opus" },
          { provider: "google", id: "gemini" },
        ];
      }
      async getAvailable(providerId?: string) {
        if (providerId) return [{ provider: providerId, id: "x" }];
        return this.getAvailableSnapshot();
      }
    }

    hideUncuratedCatalog(FakeRuntime);
    hideUncuratedCatalog(FakeRuntime);

    const runtime = new FakeRuntime();
    expect(runtime.getAvailableSnapshot()).toEqual([{ provider: "anthropic", id: "opus" }]);
    expect(await runtime.getAvailable()).toEqual([{ provider: "anthropic", id: "opus" }]);
    expect(await runtime.getAvailable("google")).toEqual([]);
    expect(await runtime.getAvailable("anthropic")).toEqual([{ provider: "anthropic", id: "x" }]);
  });
});
