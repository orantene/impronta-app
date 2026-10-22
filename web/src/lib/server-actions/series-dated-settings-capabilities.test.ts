/**
 * TUL-1708: a viewer must not write through a capability-less staff guard. The series dated-settings actions name
 * the capability they need on the guard itself; a viewer (and an editor) is refused, a manager and above is allowed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { CapabilityKey } from "@/lib/access";
import { roleGrantsCapability } from "@/lib/access/roles";

const src = readFileSync(join(process.cwd(), "src/lib/server-actions/series-dated-settings.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const CAPS: Record<string, CapabilityKey> = { load: "booking.payment.request", save: "booking.payment.request" };

test("no capability-less staff guard is left in the file", () => {
  assert.doesNotMatch(src, /\brequireWorkspaceStaffAction\(\s*\)/);
  assert.doesNotMatch(src, /\bawait staff\(\s*\)/);
  assert.match(src, /requireWorkspaceStaffAction\(\{ capability: SERIES_DATED_CAPABILITY\[action\] \}\)/);
});

test("each action names its own key in the capability map", () => {
  for (const [action, fn] of [["load", "loadSeriesDatedSettingsAction"], ["save", "saveSeriesDatedSettingsAction"]] as const) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    assert.match(body.slice(0, 900), new RegExp(`await staff\\("${action}"\\)`), fn);
    assert.match(src, new RegExp(`${action}: "${CAPS[action]}"`));
  }
});

test("a viewer and an editor are refused every capability the file requires; manager, admin and owner are allowed", () => {
  for (const cap of new Set(Object.values(CAPS))) {
    for (const role of ["viewer", "editor"] as const) assert.equal(roleGrantsCapability(role, cap), false, `${role} must not hold ${cap}`);
    for (const role of ["manager", "admin", "owner"] as const) assert.equal(roleGrantsCapability(role, cap), true, `${role} should hold ${cap}`);
  }
});
