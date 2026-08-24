import type { AutocompleteProviderFactory } from "@earendil-works/pi-coding-agent";

const HIDDEN = new Set(["login", "logout"]);

/** Map Pi's built-in /login and /logout onto our curated /auth. */
export function authRedirectArgs(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === "/login" || trimmed === "/logout") return "";
  if (trimmed.startsWith("/login ")) return trimmed.slice("/login ".length).trim();
  if (trimmed.startsWith("/logout ")) return "";
  return undefined;
}

export function isEnterKey(data: string): boolean {
  return data === "\r" || data === "\n" || data === "\r\n";
}

function commandName(value: string): string {
  return value.trim().replace(/^\//, "").split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function hideBuiltinAuthCompletions<T extends { value: string }>(items: readonly T[]): T[] {
  return items.filter((item) => !HIDDEN.has(commandName(item.value)));
}

export const wrapAuthAutocomplete: AutocompleteProviderFactory = (current) => ({
  ...(current.triggerCharacters ? { triggerCharacters: current.triggerCharacters } : {}),
  async getSuggestions(lines, cursorLine, cursorCol, options) {
    const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
    if (!suggestions) return null;
    return { ...suggestions, items: hideBuiltinAuthCompletions(suggestions.items) };
  },
  applyCompletion: (lines, cursorLine, cursorCol, item, prefix) =>
    current.applyCompletion(lines, cursorLine, cursorCol, item, prefix),
  ...(current.shouldTriggerFileCompletion
    ? {
        shouldTriggerFileCompletion: (lines: string[], cursorLine: number, cursorCol: number) =>
          current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? false,
      }
    : {}),
});
