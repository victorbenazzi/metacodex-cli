import {
  findCuratedByPiId,
  parseProviderModel,
  providersForUi,
  type CuratedProvider,
} from "./catalog.js";

/** Providers whose families have a known capability ladder (Opus before Haiku). */
const RANKED_PROVIDERS = new Set(["anthropic", "openai", "openai-codex"]);

/** Lower = more capable, listed first. Only used inside RANKED_PROVIDERS. */
const FAMILY_RANK: Record<string, number> = {
  fable: 0,
  opus: 1,
  sonnet: 2,
  haiku: 3,
  o4: 10,
  o3: 11,
  o1: 12,
  gpt: 20,
  codex: 21,
};

/** Lower = more capable within the same version (max before flash). */
const VARIANT_RANK: Record<string, number> = {
  max: 0,
  pro: 1,
  code: 2,
  plus: 3,
  mini: 8,
  flash: 9,
  fast: 10,
  nano: 11,
  lite: 12,
};

const FAMILY_NAMES = [
  "minimax",
  "deepseek",
  "gemini",
  "sonnet",
  "haiku",
  "fable",
  "opus",
  "kimi",
  "qwen",
  "mimo",
  "grok",
  "glm",
  "codex",
  "gpt",
  "o4",
  "o3",
  "o1",
  "hy",
] as const;

const FAMILY_RE = new RegExp(`^(?:claude-)?(${FAMILY_NAMES.join("|")})`, "i");
const DATE_RE = /(?:^|-)(\d{8})(?:-|$)/;

export const PICKER_SEPARATOR_PREFIX = "── ";

export interface PickerModel {
  provider: string;
  id: string;
  name?: string;
}

export interface ParsedModelId {
  family: string;
  version: number[];
  date: string | undefined;
  variantRank: number;
}

export function isPickerSeparator(option: string): boolean {
  const trimmed = option.trim();
  return trimmed === "──" || trimmed.startsWith(PICKER_SEPARATOR_PREFIX);
}

export function formatProviderSeparator(label: string): string {
  return `${PICKER_SEPARATOR_PREFIX}${label}`;
}

export function parseModelId(id: string): ParsedModelId {
  const lower = id.toLowerCase();
  const dateMatch = lower.match(DATE_RE);
  const date = dateMatch?.[1];
  const withoutDate = date ? lower.replace(DATE_RE, "-").replace(/-$/u, "") : lower;

  const familyMatch = withoutDate.match(FAMILY_RE);
  const family = familyMatch?.[1] ?? firstTokenFamily(withoutDate);

  let remainder = familyMatch ? withoutDate.slice(familyMatch[0].length) : withoutDate;
  remainder = remainder.replace(/^[-_./]+/u, "");

  const variantRank = variantRankFrom(remainder);
  const version = [...remainder.matchAll(/\d+/gu)].map((match) => Number(match[0]));

  return { family, version, date, variantRank };
}

function firstTokenFamily(id: string): string {
  const token = id.split(/[-_/]/u)[0] ?? id;
  return token.replace(/\d.*$/u, "") || token || id;
}

function variantRankFrom(remainder: string): number {
  let best = 4;
  for (const [name, rank] of Object.entries(VARIANT_RANK)) {
    if (remainder.includes(name) && rank < best) best = rank;
  }
  return best;
}

function compareVersion(left: readonly number[], right: readonly number[]): number {
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) return b - a;
  }
  return 0;
}

function providerLabel(piId: string): string {
  return findCuratedByPiId(piId)?.label ?? piId;
}

function familyOrderKey(provider: string, family: string): [number, string] {
  if (RANKED_PROVIDERS.has(provider)) {
    return [FAMILY_RANK[family] ?? 500, family];
  }
  return [0, family];
}

export function comparePickerModels(a: PickerModel, b: PickerModel): number {
  const labelCmp = providerLabel(a.provider).localeCompare(providerLabel(b.provider), "en", {
    sensitivity: "base",
  });
  if (labelCmp !== 0) return labelCmp;

  const parsedA = parseModelId(a.id);
  const parsedB = parseModelId(b.id);
  const [rankA, nameA] = familyOrderKey(a.provider, parsedA.family);
  const [rankB, nameB] = familyOrderKey(b.provider, parsedB.family);
  if (rankA !== rankB) return rankA - rankB;
  const familyCmp = nameA.localeCompare(nameB, "en", { sensitivity: "base" });
  if (familyCmp !== 0) return familyCmp;

  const versionCmp = compareVersion(parsedA.version, parsedB.version);
  if (versionCmp !== 0) return versionCmp;
  if (parsedA.variantRank !== parsedB.variantRank) return parsedA.variantRank - parsedB.variantRank;

  if (parsedA.date && !parsedB.date) return 1;
  if (!parsedA.date && parsedB.date) return -1;
  if (parsedA.date && parsedB.date && parsedA.date !== parsedB.date) {
    return parsedB.date.localeCompare(parsedA.date);
  }

  return a.id.localeCompare(b.id, "en", { sensitivity: "base" });
}

export function sortModelsForPicker<T extends PickerModel>(models: readonly T[]): T[] {
  return [...models].sort(comparePickerModels);
}

export interface ProviderPickRow {
  piId: string;
  label: string;
  count: number;
}

export function providersInModels(models: readonly PickerModel[]): ProviderPickRow[] {
  const counts = new Map<string, number>();
  for (const model of models) {
    counts.set(model.provider, (counts.get(model.provider) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([piId, count]) => ({ piId, label: providerLabel(piId), count }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}

export function formatProviderPickRows(providers: readonly ProviderPickRow[]): string[] {
  return providers.map((provider) => provider.label);
}

export function parseProviderPickRow(
  option: string,
  providers: readonly ProviderPickRow[],
): string | undefined {
  const trimmed = option.trim();
  const byLabel = providers.find((provider) => provider.label === trimmed);
  if (byLabel) return byLabel.piId;
  const first = trimmed.split(/\s+/u)[0];
  return providers.find((provider) => provider.piId === first)?.piId;
}

function modelLabel(model: PickerModel): string {
  const name = model.name?.trim();
  return name && name !== model.id ? name : model.id;
}

/** Short rows for ctx.ui.select. No padding: long lines wrap and the Pi selector jumps. */
export function formatModelRows(
  models: readonly PickerModel[],
  current?: { provider: string; id: string },
): string[] {
  return sortModelsForPicker(models).map((model) => {
    const mark =
      current && current.provider === model.provider && current.id === model.id ? "  (current)" : "";
    return `${modelLabel(model)}${mark}`;
  });
}

export function parseModelRow(
  option: string,
  provider: string,
  models: readonly PickerModel[] = [],
): { provider: string; id: string } | undefined {
  const trimmed = option.trim().replace(/\s+\(current\)$/u, "").trim();
  const fromList = models.find(
    (model) =>
      modelLabel(model) === trimmed ||
      model.id === trimmed ||
      `${model.provider}/${model.id}` === trimmed,
  );
  if (fromList) return { provider: fromList.provider, id: fromList.id };
  const parsed = parseProviderModel(option);
  if (parsed) return parsed;
  const id = trimmed.split(/\s+/u)[0];
  if (!id) return undefined;
  return { provider, id };
}

function padCells(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows.map((row) =>
    row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0))).join("  "),
  );
}

export function formatAuthRows(
  providers: readonly CuratedProvider[],
  statusOf: (piId: string) => { configured: boolean; source?: string },
): string[] {
  const ordered = providers.length > 0 ? [...providers] : providersForUi();
  return padCells(
    ordered.map((provider) => {
      const status = statusOf(provider.piId);
      let state = "not connected";
      if (status.configured) {
        if (status.source === "environment") state = "env";
        else if (status.source === "stored" || !status.source) state = "connected";
        else state = status.source;
      }
      return [provider.id, provider.label, provider.methods.join(", "), state];
    }),
  );
}
