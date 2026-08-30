import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  EXCLUSIVE_RELEASE_CAPABILITY,
  EXCLUSIVE_RELEASE_DENIED,
  exclusiveReleaseFromStaffAuth,
  roleCanFlipExclusiveRelease,
} from "./exclusive-release-gate";

const ACTION = readFileSync(
  join(__dirname, "..", "server-actions", "roster-direct-booking.ts"),
  "utf8",
);
const SWITCH = readFileSync(
  join(__dirname, "..", "..", "components", "appointments", "DirectBookingRosterSwitch.tsx"),
  "utf8",
);

test("owner and admin can flip exclusive release; other staff cannot", () => {
  assert.equal(roleCanFlipExclusiveRelease("owner"), true);
  assert.equal(roleCanFlipExclusiveRelease("admin"), true);
  assert.equal(roleCanFlipExclusiveRelease("manager"), false);
  assert.equal(roleCanFlipExclusiveRelease("editor"), false);
  assert.equal(roleCanFlipExclusiveRelease("viewer"), false);
});

test("failed staff auth is refused with the owner/admin reason (not a silent hide)", () => {
  const refused = exclusiveReleaseFromStaffAuth({ ok: false, error: "Not authorized." });
  assert.deepEqual(refused, { ok: false, error: EXCLUSIVE_RELEASE_DENIED });
});

test("admin-grade staff auth is allowed through to the write", () => {
  assert.deepEqual(exclusiveReleaseFromStaffAuth({ ok: true }), { ok: true });
});

test("setRosterExternalBookingReleased grades to manage_agency_settings", () => {
  const idx = ACTION.indexOf("export async function setRosterExternalBookingReleased");
  assert.ok(idx >= 0);
  const body = ACTION.slice(idx, idx + 700);
  assert.match(
    body,
    /requireWorkspaceStaffAction\(\{\s*\n\s*capability: "manage_agency_settings",/,
  );
  assert.match(body, /EXCLUSIVE_RELEASE_DENIED/);
  assert.equal(EXCLUSIVE_RELEASE_CAPABILITY, "manage_agency_settings");
});

test("release switch stays visible and disables with a reason for non-admin staff", () => {
  assert.match(SWITCH, /canRelease/);
  assert.match(SWITCH, /rosterReleaseStaffLocked/);
  assert.doesNotMatch(
    SWITCH,
    /if \(!canRelease\) return null/,
    "must not hide the switch for non-admin staff",
  );
});
