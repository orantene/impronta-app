/**
 * TUL-1871 / TUL-1368: decideTalentApplication is capability-gated and approve goes through the
 * roster-adding flow. Source-level wire check.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(process.cwd(), "src/lib/talent/apply-actions.ts"), "utf8");
const decide = src.slice(src.indexOf("export async function decideTalentApplication"), src.indexOf("export async function withdrawOwnApplication"));

test("decide is gated on manage_talent_roster for the application's workspace", () => {
  assert.match(decide, /userHasCapability\("manage_talent_roster", r\.tenant_id\)/);
  assert.doesNotMatch(src, /requireWorkspaceStaffAction\(\s*\)/);
});

test("approve adds the talent to the roster, respects the seat cap and notifies", () => {
  assert.match(decide, /approveApplicationIntoRoster\(/);
  assert.match(decide, /checkRosterSeatAvailability\(/);
  assert.match(decide, /notifyRosterJoinApproved\(/);
});

test("reject is conditional on pending (double click safe)", () => {
  assert.match(decide, /\.eq\("status", "pending"\)/);
});

test("an approved application can be approved again to repair a missing roster row, and the admin layout is revalidated", () => {
  assert.match(decide, /repairApproved/);
  assert.match(decide, /revalidatePath\("\/\[tenantSlug\]\/admin", "layout"\)/);
});
