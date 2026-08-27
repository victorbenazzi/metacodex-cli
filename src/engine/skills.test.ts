import { describe, expect, it } from "vitest";
import { hushSkillStartupDump, visibleSkillDiagnostics } from "./skills.js";

describe("visibleSkillDiagnostics", () => {
  it("keeps load errors and drops description/collision nits", () => {
    expect(
      visibleSkillDiagnostics([
        { type: "warning", message: "description exceeds 1024 characters (1416)" },
        { type: "collision", message: 'name "geo" collision' },
        { type: "error", message: "failed to parse skill file" },
      ]),
    ).toEqual([{ type: "error", message: "failed to parse skill file" }]);
  });
});

describe("hushSkillStartupDump", () => {
  it("filters getSkills diagnostics on the loader prototype", () => {
    class FakeLoader {
      getSkills() {
        return {
          skills: [{ name: "geo" }],
          diagnostics: [
            { type: "warning", message: "description exceeds 1024 characters (1045)" },
            { type: "error", message: "boom" },
          ],
        };
      }
    }

    hushSkillStartupDump(FakeLoader);
    hushSkillStartupDump(FakeLoader);
    expect(new FakeLoader().getSkills()).toEqual({
      skills: [{ name: "geo" }],
      diagnostics: [{ type: "error", message: "boom" }],
    });
  });
});
