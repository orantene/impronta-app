/**
 * TUL-1708: a viewer must not write through a capability-less staff guard. classes-actions.ts used to call
 * `requireWorkspaceStaffAction()` with no capability (default `agency.workspace.view`, which `viewer` holds)
 * and check the real capability afterward in a local helper. Every action now names its capability on the
 * guard itself, from `CLASSES_WRITE_CAPABILITY`; a viewer (and an editor) is refused, a manager and above
 * is allowed. Follows the precedent in #4300 (dated-details-capabilities.test.ts): self-contained, does not
 * depend on the capabilityless-staff-guard ratchet from #4288, which is not on main yet.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";
import { CLASSES_WRITE_CAPABILITY } from "@/lib/pos/classes/write-capabilities";

const src = readFileSync(
  join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/classes-actions.ts"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const ACTIONS = [
  ["checkIn", "classesCheckIn"],
  ["markAttendance", "classesMarkAttendance"],
  ["walkInSlots", "classesWalkInSlots"],
  ["services", "classesServices"],
  ["moveSlots", "classesMoveSlots"],
  ["bookWalkIn", "classesBookWalkIn"],
  ["holdSeat", "classesHoldSeat"],
  ["nameSeatHolders", "classesNameSeatHolders"],
] as const;

test("no capability-less staff guard is left in the file", () => {
  assert.doesNotMatch(src, /\brequireWorkspaceStaffAction\(\s*\)/);
  assert.doesNotMatch(src, /\bawait staff\(\s*\)/);
  // the local staff() helper itself must forward a capability into the guard, not default it away
  assert.match(src, /async function staff\(capability: CapabilityKey\)/);
  assert.match(src, /requireWorkspaceStaffAction\(\{ capability \}\)/);
});

test("every exported action passes its own key from CLASSES_WRITE_CAPABILITY", () => {
  for (const [action, fn] of ACTIONS) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    const next = body.indexOf("export async function", 10);
    const fnBody = next > 0 ? body.slice(0, next) : body;
    assert.match(fnBody, new RegExp(`await staff\\(WRITE_CAP\\.${action}\\)`), fn);
  }
});

test("CLASSES_WRITE_CAPABILITY has an entry for every action, all mapped to booking.payment.request", () => {
  for (const [action] of ACTIONS) {
    assert.equal(CLASSES_WRITE_CAPABILITY[action], "booking.payment.request", action);
  }
});

test("a viewer and an editor are refused every capability the file requires; manager, admin and owner are allowed", () => {
  const caps = new Set(Object.values(CLASSES_WRITE_CAPABILITY));
  for (const cap of caps) {
    for (const role of ["viewer", "editor"] as const) {
      assert.equal(roleGrantsCapability(role, cap), false, `${role} must not hold ${cap}`);
    }
    for (const role of ["manager", "admin", "owner"] as const) {
      assert.equal(roleGrantsCapability(role, cap), true, `${role} should hold ${cap}`);
    }
  }
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true, "the old default still reads elsewhere");
});
