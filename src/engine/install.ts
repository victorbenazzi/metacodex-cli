import { hideUncuratedCatalog } from "./catalog.js";
import { hushSkillStartupDump } from "./skills.js";

type SkillLoader = {
  prototype: { getSkills: () => { skills: unknown; diagnostics: { type: string }[] } };
};

type RuntimeLike = Parameters<typeof hideUncuratedCatalog>[0];

/** Catalog filter and skill-hush patches. Call once after importing the Pi SDK. */
export function installEngineShims(loader: SkillLoader, runtime: RuntimeLike): void {
  hushSkillStartupDump(loader);
  hideUncuratedCatalog(runtime);
}
