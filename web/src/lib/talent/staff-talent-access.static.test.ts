import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const WEB = process.cwd();
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

// TUL-1708 P1: these writers use the service role, so a global staff app_role must never be enough.
for (const file of ["src/lib/talent/services-menu-actions.ts", "src/lib/talent/talent-booking-terms-actions.ts"]) {
  test(`${file} authorizes staff through the roster, not a global app_role`, () => {
    const src = read(file);
    assert.doesNotMatch(src, /isStaffRole/, "no app_role staff check");
    const fn = src.slice(src.indexOf("async function authorizeForTalent"));
    assert.match(fn, /staffMayEditTalent\(talentProfileId\)/);
    assert.match(fn, /if \(!isOwner && !isStaff\) return \{ ok: false, error: "Forbidden\." \}/);
  });
}

test("staffMayEditTalent needs agency.roster.edit in a workspace whose roster includes the talent", () => {
  const src = read("src/lib/talent/staff-talent-access.ts");
  assert.match(src, /requireWorkspaceStaffAction\(\{ capability: "agency\.roster\.edit" \}\)/);
  assert.match(src, /talentOnWorkspaceRoster\(admin, staff\.tenantId, talentProfileId\)/);
  assert.match(src, /if \(!staff\.ok\) return false/);
});
