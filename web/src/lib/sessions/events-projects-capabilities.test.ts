/**
 * TUL-1708: the events readers name their default capability out loud (no capability-less guard left), and the
 * project milestone writers need `coordinate_inquiry` (a viewer holds the `view_dashboard` they used to check).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const ADMIN = "src/app/(workspace)/[tenantSlug]/admin/";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("no capability-less staff guard is left in the events and runs files", () => {
  for (const f of [ADMIN + "_events-actions.ts", ADMIN + "_events-schedule-actions.ts", ADMIN + "_events-page-actions.ts", "src/lib/server-actions/runs-events.ts"]) {
    assert.doesNotMatch(read(f), /\brequireWorkspaceStaffAction\(\s*\)/, f);
  }
});

test("event writers still need manage_agency_settings; only the readers say agency.workspace.view", () => {
  for (const f of [ADMIN + "_events-actions.ts", ADMIN + "_events-schedule-actions.ts", ADMIN + "_events-page-actions.ts"]) {
    const src = read(f);
    assert.match(src, /requireWorkspaceStaffAction\(\{ capability: CAPABILITY \}\)/, f);
    assert.match(src, /capability: "agency\.workspace\.view"/, f);
    assert.match(src, /const CAPABILITY = "manage_agency_settings"/, f);
  }
});

test("project milestone actions all go through a coordinate_inquiry guard; view_dashboard is no longer enough", () => {
  const src = read(ADMIN + "projects/[projectId]/actions.ts");
  assert.match(src, /requireWorkspaceStaffAction\(\{ capability: "coordinate_inquiry" \}\)/);
  assert.doesNotMatch(src, /view_dashboard/);
  assert.equal((src.match(/await guard\(\)/g) ?? []).length, 3);
});

test("a viewer and an editor are refused coordinate_inquiry; manager, admin, owner allowed", () => {
  for (const role of ["viewer", "editor"] as const) assert.equal(roleGrantsCapability(role, "coordinate_inquiry"), false, role);
  for (const role of ["manager", "admin", "owner"] as const) assert.equal(roleGrantsCapability(role, "coordinate_inquiry"), true, role);
  assert.equal(roleGrantsCapability("viewer", "view_dashboard"), true, "the old check let a viewer through");
});
