import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Client shell must not re-read TALENT_AGENDA_V2 from process.env — that
 * env is server-only. The layout stamps `talentAgendaV2` onto the bridge.
 * After Step 4 the router no longer branches on the stamp for page choice.
 */
describe("G0 Agenda V2 client flag bridge", () => {
  it("talent router does not call isAgendaV2()", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/admin/shell/internal/talent.tsx"),
      "utf8",
    );
    assert.doesNotMatch(src, /isAgendaV2\(/);
    assert.doesNotMatch(src, /from ["']@\/lib\/talent-agenda\/flag["']/);
  });

  it("TodayPage does not re-read the flag", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/admin/shell/internal/talent/pages/TodayPage.tsx"),
      "utf8",
    );
    assert.doesNotMatch(src, /isAgendaV2\(/);
    assert.doesNotMatch(src, /bridgeTalentAgendaV2/);
  });

  it("talent layout still stamps talentAgendaV2 onto the bridge", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/(workspace)/talent/layout.tsx"),
      "utf8",
    );
    assert.match(src, /talentAgendaV2/);
    assert.match(src, /isAgendaV2\(talentSelfProfile\.id\)/);
  });
});
