/**
 * Pi 0.84.x coupling. One list. Do not rewrite these shims here.
 *
 * hideUncuratedCatalog (src/engine/catalog.ts)
 *   Patches ModelRuntime.prototype.getAvailable and getAvailableSnapshot.
 *   Why: Pi /model falls back to every authenticated provider when scopedModels is empty.
 *   Breaks if those methods move off the prototype or skip the patch: OpenRouter and the rest show up.
 *
 * hushSkillStartupDump (src/engine/skills.ts)
 *   Patches DefaultResourceLoader.prototype.getSkills.
 *   Why: Pi dumps skill diagnostics at boot even with quietStartup.
 *   Breaks if getSkills moves or diagnostic type tags change: the boot dump returns.
 *
 * installResumeHintRewrite (src/engine/resume.ts, installed from src/cli.ts, stdout)
 *   Wraps stdout.write.
 *   Why: Pi prints `pi --session` on quit. Sessions live under ~/.mcx.
 *   Breaks if the resume sentence changes and we miss the rewrite: people run `pi --session`.
 *
 * setEngineTitle (src/engine/title.ts)
 *   setTitle now plus setTimeout(0).
 *   Why: Pi restores its default title after session_start.
 *   Breaks if title restore timing changes: OSC / tab title flickers back to pi.
 *
 * applyGhosttyThemeContrastWorkaround (src/engine/theme.ts, installed from src/cli.ts)
 *   Cross-checks Ghostty's color-scheme report against its actual OSC 11 background.
 *   Why: Ghostty 1.3.1 can report the Linux desktop scheme instead of the terminal palette.
 *   Breaks if Pi changes --use-theme semantics: a conflicting report can select low-contrast colors.
 *
 * disguiseOverflowForRetry (src/router/fallback.ts)
 *   Prefixes overflow errors with `rate limit:` after we hop.
 *   Why: Pi will not auto-retry overflow after one compact. The disguise re-enters the retry loop.
 *   Breaks if the Pi retry classifier changes: hop after overflow stalls, or the disguise becomes a no-op.
 *
 * /model and /login intercept (src/extensions/handoff.ts, src/extensions/auth.ts)
 *   onTerminalInput, consume Enter before Pi.
 *   Why: /model cross-provider must inject our packet; /login is Pi's uncurated picker.
 *   Breaks if Enter handling or command dispatch moves: native /login catalog leaks, /model skips the packet.
 */

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
