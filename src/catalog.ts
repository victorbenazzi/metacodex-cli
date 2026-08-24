export type AuthMethod = "oauth" | "api_key";

export interface CuratedProvider {
  /** Row id in /auth. Stable. */
  id: string;
  /** Pi ModelRuntime provider id. */
  piId: string;
  label: string;
  methods: AuthMethod[];
}

/**
 * Visible in /auth, /model, /handoff, and fallback chains.
 * Everything else in the Pi engine stays hidden in v1.
 */
export const CURATED_PROVIDERS: readonly CuratedProvider[] = [
  {
    id: "anthropic",
    piId: "anthropic",
    label: "Anthropic",
    methods: ["oauth", "api_key"],
  },
  {
    id: "openai",
    piId: "openai",
    label: "OpenAI API",
    methods: ["api_key"],
  },
  {
    id: "openai-codex",
    piId: "openai-codex",
    label: "OpenAI Codex",
    methods: ["oauth"],
  },
  {
    id: "opencode-zen",
    piId: "opencode",
    label: "OpenCode Zen",
    methods: ["api_key"],
  },
  {
    id: "opencode-go",
    piId: "opencode-go",
    label: "OpenCode Go",
    methods: ["api_key"],
  },
  {
    id: "deepseek",
    piId: "deepseek",
    label: "DeepSeek",
    methods: ["api_key"],
  },
  {
    id: "kimi",
    piId: "kimi-coding",
    label: "Kimi",
    methods: ["oauth", "api_key"],
  },
];

const PI_IDS = new Set(CURATED_PROVIDERS.map((p) => p.piId));

export function isCuratedPiProvider(piId: string): boolean {
  return PI_IDS.has(piId);
}

export function findCuratedByPiId(piId: string): CuratedProvider | undefined {
  return CURATED_PROVIDERS.find((p) => p.piId === piId);
}

export function findCuratedProvider(query: string): CuratedProvider | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return CURATED_PROVIDERS.find(
    (p) => p.id === q || p.piId === q || p.label.toLowerCase() === q,
  );
}

/** Patterns for Pi `enabledModels`. Hides the rest of the engine catalog. */
export function curatedEnabledModelPatterns(): string[] {
  return CURATED_PROVIDERS.map((p) => `${p.piId}/*`);
}

/** `enabledModels` entries for the curated wallets that currently have a credential. */
export function enabledModelPatternsForPiIds(piIds: readonly string[]): string[] {
  const wanted = new Set(piIds.filter(isCuratedPiProvider));
  return CURATED_PROVIDERS.filter((provider) => wanted.has(provider.piId)).map(
    (provider) => `${provider.piId}/*`,
  );
}

/** Curated provider ids present in an auth.json object. */
export function storedCuratedPiIds(auth: unknown): string[] {
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return [];
  return Object.keys(auth).filter(isCuratedPiProvider);
}

/** Default model picker order after first login. */
export function curatedPiIdOrder(): string[] {
  return CURATED_PROVIDERS.map((p) => p.piId);
}
