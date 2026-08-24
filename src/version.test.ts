import { describe, expect, it } from "vitest";
import { PI_SKIP_VERSION_CHECK_ENV, pinEngineUpdates } from "./version.js";

describe("pinEngineUpdates", () => {
  it("sets PI_SKIP_VERSION_CHECK so Pi does not advertise pi update", () => {
    const env: NodeJS.ProcessEnv = {};
    pinEngineUpdates(env);
    expect(env[PI_SKIP_VERSION_CHECK_ENV]).toBe("1");
  });
});
