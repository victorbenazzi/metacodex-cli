import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { extraSkillDirs } from "../skills/discovery.js";

export type SkillDiscovery = (cwd: string) => string[];

export function registerSkillDiscovery(
  pi: ExtensionAPI,
  options: { discover?: SkillDiscovery } = {},
): void {
  const discover = options.discover ?? extraSkillDirs;
  pi.on("resources_discover", (event) => {
    const skillPaths = discover(event.cwd);
    if (skillPaths.length === 0) return;
    return { skillPaths };
  });
}
