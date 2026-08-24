import { curatedModelsOnly, isCuratedPiProvider } from "./catalog.js";

type AvailableModel = { provider: string };

type RuntimeLike = {
  prototype: {
    getAvailableSnapshot: () => readonly AvailableModel[];
    getAvailable: (...args: never[]) => Promise<readonly AvailableModel[]>;
  };
};

const patched = new WeakSet<object>();

/**
 * Pi's /model picker falls back to every authenticated provider when scopedModels
 * is empty (first-run, no curated wallet). Keep Gemini/OpenRouter/etc off that list.
 */
export function hideUncuratedCatalog(runtime: RuntimeLike): void {
  if (patched.has(runtime.prototype)) return;
  patched.add(runtime.prototype);

  const proto = runtime.prototype;
  const originalSnapshot = proto.getAvailableSnapshot;
  proto.getAvailableSnapshot = function (this: unknown) {
    return curatedModelsOnly(originalSnapshot.call(this as never));
  };

  const originalAvailable = proto.getAvailable;
  proto.getAvailable = async function (this: unknown, ...args: never[]) {
    const providerId = args[0] as string | undefined;
    if (typeof providerId === "string" && !isCuratedPiProvider(providerId)) {
      return [];
    }
    const models = await originalAvailable.apply(this as never, args);
    return typeof providerId === "string" ? models : curatedModelsOnly(models);
  };
}
