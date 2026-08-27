/**
 * Pi always prints skill diagnostics at startup, even with quietStartup.
 * Validation nits (description too long, name charset) still load the skill.
 * Collisions we already avoid by not injecting duplicate extra paths.
 * Keep real load errors. Drop the rest so the boot stays a header and a prompt.
 */

export function visibleSkillDiagnostics<T extends { type: string }>(diagnostics: readonly T[]): T[] {
  return diagnostics.filter((item) => item.type === "error");
}

type SkillsSnapshot = {
  skills: unknown;
  diagnostics: { type: string }[];
};

const patched = new WeakSet<object>();

export function hushSkillStartupDump(loader: { prototype: { getSkills: () => SkillsSnapshot } }): void {
  if (patched.has(loader.prototype)) return;
  patched.add(loader.prototype);
  const original = loader.prototype.getSkills;
  loader.prototype.getSkills = function (this: unknown) {
    const result = original.call(this);
    return {
      skills: result.skills,
      diagnostics: visibleSkillDiagnostics(result.diagnostics),
    };
  };
}
