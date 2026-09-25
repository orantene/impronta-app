import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readAgendaV2Mode } from "./flag";

/**
 * T9.6 — legacy Today/Calendar stay reachable while the flag is off.
 * Deletion is a follow-up PR after ≥7 days of TALENT_AGENDA_V2=all.
 */
describe("T9.6 legacy surfaces retained for rollback", () => {
  it("talent router still imports legacy Today and Calendar pages", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/components/admin/shell/internal/talent.tsx",
      ),
      "utf8",
    );
    assert.match(src, /TalentTodayPage/);
    assert.match(src, /CalendarPage/);
    assert.match(src, /isAgendaV2/);
  });

  it("flag defaults off so production stays on legacy until rollout", () => {
    assert.equal(readAgendaV2Mode(undefined), "off");
  });
});
