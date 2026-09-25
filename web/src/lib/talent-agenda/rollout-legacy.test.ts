import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readAgendaV2Mode } from "./flag";

/**
 * ROLLOUT Step 4 — legacy Today/Calendar agenda paths removed.
 * Flag helpers stay for one release as a soft kill switch (empty V2 load).
 */
describe("T9.6 legacy agenda surfaces removed (Step 4)", () => {
  it("talent router does not import legacy CalendarPage", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/admin/shell/internal/talent.tsx"),
      "utf8",
    );
    assert.match(src, /AgendaCalendarPage/);
    assert.match(src, /TalentTodayPage/);
    assert.doesNotMatch(src, /from ["']\.\/talent\/pages\/CalendarPage["']/);
    assert.doesNotMatch(src, /agendaV2\s*\?/);
  });

  it("TodayPage is Agenda V2 only", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/components/admin/shell/internal/talent/pages/TodayPage.tsx",
      ),
      "utf8",
    );
    assert.match(src, /AgendaTodayPage/);
    assert.doesNotMatch(src, /bridgeTalentAgendaV2/);
    assert.doesNotMatch(src, /WeekRhythmStrip/);
  });

  it("flag helpers still default off (soft kill switch retained)", () => {
    assert.equal(readAgendaV2Mode(undefined), "off");
  });
});
