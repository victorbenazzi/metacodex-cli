import { describe, expect, it } from "vitest";
import {
  authRedirectArgs,
  hideBuiltinAuthCompletions,
  isEnterKey,
  wrapAuthAutocomplete,
} from "./auth-redirect.js";

describe("authRedirectArgs", () => {
  it("maps /login and /logout onto /auth, including a login provider arg", () => {
    expect(authRedirectArgs("/login")).toBe("");
    expect(authRedirectArgs("  /logout  ")).toBe("");
    expect(authRedirectArgs("/login anthropic")).toBe("anthropic");
    expect(authRedirectArgs("/login  kimi-coding")).toBe("kimi-coding");
    expect(authRedirectArgs("/logout anthropic")).toBe("");
    expect(authRedirectArgs("/auth")).toBeUndefined();
    expect(authRedirectArgs("hello")).toBeUndefined();
  });
});

describe("hideBuiltinAuthCompletions", () => {
  it("drops Pi login/logout rows and keeps /auth", () => {
    expect(
      hideBuiltinAuthCompletions([
        { value: "login", label: "login" },
        { value: "/logout", label: "logout" },
        { value: "auth", label: "auth" },
        { value: "model", label: "model" },
      ]).map((item) => item.value),
    ).toEqual(["auth", "model"]);
  });
});

describe("wrapAuthAutocomplete", () => {
  it("filters suggestions from the wrapped provider", async () => {
    const wrapped = wrapAuthAutocomplete({
      async getSuggestions() {
        return {
          prefix: "/",
          items: [
            { value: "login", label: "login", description: "Configure provider authentication" },
            { value: "auth", label: "auth", description: "Connect a curated provider" },
          ],
        };
      },
      applyCompletion(lines) {
        return { lines, cursorLine: 0, cursorCol: 0 };
      },
    });
    const suggestions = await wrapped.getSuggestions([""], 0, 0, { signal: new AbortController().signal });
    expect(suggestions?.items.map((item) => item.value)).toEqual(["auth"]);
  });
});

describe("isEnterKey", () => {
  it("matches enter, not other keys", () => {
    expect(isEnterKey("\r")).toBe(true);
    expect(isEnterKey("\n")).toBe(true);
    expect(isEnterKey("a")).toBe(false);
  });
});
