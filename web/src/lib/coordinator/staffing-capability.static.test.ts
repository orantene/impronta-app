/**
 * TUL-1373 role scope for the Team tab's staffing picker: holding or releasing a person's dates writes to
 * their calendar, so it takes agency.roster.edit (editor and above; a viewer is refused), the same key as the
 * calendar hold actions. Reason codes only, impersonation blocked, tenant never taken from the client.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DIR = "src/app/(workspace)/[tenantSlug]/admin/projects/[projectId]";

test("role matrix: viewer cannot hold dates; editor, manager, admin and owner can", () => {
  assert.equal(roleGrantsCapability("viewer", "agency.roster.edit"), false);
  for (const role of ["editor", "manager", "admin", "owner"] as const) assert.equal(roleGrantsCapability(role, "agency.roster.edit"), true, role);
});

test("both actions name the capability on the guard, re-check it, and block impersonation", () => {
  const src = read(`${DIR}/staffing-actions.ts`);
  assert.match(src, /requireWorkspaceStaffAction\(\{ capability: "agency\.roster\.edit" \}\)/);
  assert.match(src, /userHasCapability\("agency\.roster\.edit", guard\.tenantId\)/);
  assert.doesNotMatch(src, /requireWorkspaceStaffAction\(\s*\)/);
  assert.equal((src.match(/await requireNotImpersonating\(\)/g) ?? []).length, 2);
  // the tenant comes from the guard, not from the input
  assert.doesNotMatch(src, /tenantId:\s*z\./);
  assert.match(src, /tenantId: g\.tenantId/);
});

test("the hold writer is the existing one (no new table) and the page passes the same capability to the screen", () => {
  const lib = read("src/lib/projects/project-holds.server.ts");
  assert.match(lib, /placeReservationHold/);
  assert.match(lib, /\.eq\("tenant_id", input\.tenantId\)/);
  assert.match(read(`${DIR}/page.tsx`), /userHasCapability\("agency\.roster\.edit", scope\.tenantId\)/);
});

test("the screen copy exists in en and es for every key the Team tab uses", () => {
  const keys = ["staffTitle", "staffHint", "staffShowBusy", "staffMinRating", "staffAnyRating", "staffFree", "staffBusy", "staffUnknown", "staffOnJob", "staffHeld", "staffHold", "staffRelease", "staffOutAssigned", "staffOutHeld", "staffOutRoster", "staffOutTaken", "staffOutFailed", "staffNotAllowed", "staffNoWindow", "staffUnavailable"];
  for (const lang of ["en", "es"]) {
    const team = JSON.parse(read(`messages/${lang}.json`)).dashboard.projects.team as Record<string, string>;
    for (const k of keys) {
      assert.ok(typeof team[k] === "string" && team[k].length > 0, `${lang}.${k}`);
      assert.doesNotMatch(team[k], /—/, `${lang}.${k} has an em dash`);
    }
  }
  const tab = read(`${DIR}/team-tab.tsx`);
  for (const k of keys) assert.ok(tab.includes(`team.${k}`), `team-tab uses ${k}`);
});
