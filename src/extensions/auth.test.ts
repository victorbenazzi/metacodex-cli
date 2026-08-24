import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  answerLoginPrompt,
  formatAuthOption,
  formatFallbackChain,
  formatLoginOption,
  isFallbackOption,
  parseAuthOption,
  parseLoginOption,
  registerAuthCommand,
} from "./auth.js";

describe("auth option rows", () => {
  const anthropic = {
    id: "anthropic",
    piId: "anthropic",
    label: "Anthropic",
    methods: ["oauth" as const, "api_key" as const],
  };

  it("encodes id first so we can round-trip the select label", () => {
    const row = formatAuthOption(anthropic, { configured: false });
    expect(row).toContain("Anthropic");
    expect(row).toContain("not connected");
    expect(parseAuthOption(row)).toBe("anthropic");
  });

  it("marks stored credentials as connected", () => {
    const row = formatAuthOption(anthropic, { configured: true, source: "stored" });
    expect(row).toContain("connected");
    expect(parseAuthOption("not-a-provider  x")).toBeUndefined();
  });

  it("formats the fallback chain and recognizes the fallback row", () => {
    expect(formatFallbackChain([])).toBe("(empty, same-model retry)");
    expect(formatFallbackChain(["anthropic", "deepseek"])).toBe("anthropic, deepseek");
    expect(isFallbackOption("fallback  Fallback chain")).toBe(true);
    expect(isFallbackOption("anthropic  Anthropic")).toBe(false);
  });
});

describe("login method options", () => {
  it("round-trips Codex browser vs device-code labels", () => {
    const browser = { id: "browser", label: "Browser OAuth" };
    const device = { id: "device", label: "Device code", description: "headless" };
    expect(parseLoginOption(formatLoginOption(browser), [browser, device])).toBe("browser");
    expect(parseLoginOption(formatLoginOption(device), [browser, device])).toBe("device");
  });

  it("redirects Enter on /login to the curated /auth command", async () => {
    const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();
    const commands = new Map<string, { handler: (args: string, ctx: ExtensionContext) => Promise<void> }>();
    const notices: string[] = [];
    let inputHandler: ((data: string) => { consume?: boolean } | undefined) | undefined;
    let editor = "/login";

    const ctx = {
      mode: "tui" as const,
      model: undefined,
      modelRegistry: {
        getProviderAuthStatus: () => ({ configured: false }),
      },
      ui: {
        onTerminalInput(handler: (data: string) => { consume?: boolean } | undefined) {
          inputHandler = handler;
          return () => {
            inputHandler = undefined;
          };
        },
        addAutocompleteProvider() {},
        getEditorText: () => editor,
        setEditorText(text: string) {
          editor = text;
        },
        notify(message: string) {
          notices.push(message);
        },
        select: async () => undefined,
        input: async () => undefined,
        setWidget() {},
      },
    };

    const pi = {
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      registerCommand(name: string, spec: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
        commands.set(name, spec);
      },
    };

    registerAuthCommand(pi as unknown as ExtensionAPI);
    expect(commands.has("auth")).toBe(true);
    for (const handler of handlers.get("session_start") ?? []) {
      handler({}, ctx as unknown as ExtensionContext);
    }

    expect(inputHandler?.("\r")).toEqual({ consume: true });
    expect(editor).toBe("");
    await Promise.resolve();
    expect(notices.some((message) => message.includes("mcx home is not set"))).toBe(true);
  });

  it("skips the picker when Codex exposes a single login method", async () => {
    const id = await answerLoginPrompt(
      { type: "select", message: "Select OpenAI Codex login method:", options: [{ id: "browser", label: "Browser" }] },
      { ui: { select: async () => "should-not-run" } } as never,
    );
    expect(id).toBe("browser");
  });
});
