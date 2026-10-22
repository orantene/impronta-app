/**
 * TUL-1708 (security sweep, area I: calendar, POS support helpers & venue) —
 * PM-revised slice applied on top of #4317 (operate_venue capability).
 *
 * This is the scoped reapplication of PR #4326's fix for exactly the 4
 * functions the PM asked to be re-capped on `operate_venue` (editor+, #4317)
 * instead of the capability #4326 originally picked:
 *   - channels/pairing-actions.ts#askOwnerToConnectWhatsApp: operate_venue,
 *     not coordinate_inquiry. The other 3 WhatsApp pairing writes
 *     (startWhatsAppPairing, requestWhatsAppPairingCode, unlinkWhatsApp) are
 *     UNCHANGED from #4326 — they keep coordinate_inquiry (manager+), which
 *     already matched the canPairWhatsApp role gate those three enforce.
 *   - talent/fulfillment-actions.ts#authorizeForBooking (backing
 *     markBookingFulfillment): operate_venue, not booking.payment.mark_received.
 *   - server-actions/staff-resources.ts#createStaffResource /
 *     archiveStaffResource: operate_venue, not manage_talent_roster.
 *
 * Deliberately out of scope here (left for the main #4326 branch / a
 * separate consultant-reviewed #4317 follow-up, not reapplied in this
 * worktree): calendar/feed-actions.ts, talent-calendar/hold-actions.ts,
 * support/replay/replay-actions.ts, and server-actions/venue-settings.ts
 * (updateVenueSettings explicitly STAYS manage_agency_settings per PM
 * decision — not touched by this revision at all).
 *
 * Self-contained (no `capabilityless-staff-guard.*` ratchet dependency —
 * that infra ships with #4288/#4300, not on main or on this branch point).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";
import type { CapabilityKey } from "@/lib/access/capabilities";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, "src", p), "utf8");

const COORDINATE = "coordinate_inquiry" as const; // manager+
const OPERATE_VENUE = "operate_venue" as const; // editor+ (#4317)

function escape(cap: string): string {
  return cap.replace(/\./g, "\\.");
}

/** The 4 writers this patch re-caps on operate_venue. */
const WRITERS: Array<{ file: string; fn: string; capability: CapabilityKey }> = [
  { file: "lib/talent/fulfillment-actions.ts", fn: "authorizeForBooking", capability: OPERATE_VENUE },
  { file: "lib/server-actions/staff-resources.ts", fn: "createStaffResource", capability: OPERATE_VENUE },
  { file: "lib/server-actions/staff-resources.ts", fn: "archiveStaffResource", capability: OPERATE_VENUE },
  { file: "lib/channels/pairing-actions.ts", fn: "askOwnerToConnectWhatsApp", capability: OPERATE_VENUE },
];

/** Unchanged sibling writers in the same files, kept on coordinate_inquiry. */
const UNCHANGED_COORDINATE_WRITERS = [
  "startWhatsAppPairing",
  "requestWhatsAppPairingCode",
  "unlinkWhatsApp",
];

/** Reads in these files that must keep the viewer-held default (no capability). */
const READS: Array<{ file: string; fn: string }> = [
  { file: "lib/talent/fulfillment-actions.ts", fn: "loadTalentOrders" },
  { file: "lib/server-actions/staff-resources.ts", fn: "listStaffResources" },
  { file: "lib/channels/pairing-actions.ts", fn: "loadWhatsAppConnection" },
];

/** Slices a named `export async function <fn>` (or a local helper fn) out of source. */
function body(src: string, fn: string): string {
  const re = new RegExp(`(?:export\\s+async\\s+function|async\\s+function)\\s+${fn}\\b`);
  const m = re.exec(src);
  assert.ok(m, `could not find function ${fn} in source`);
  const start = m!.index;
  const rest = src.slice(start + m![0].length);
  const nextFn = /(?:export\s+async\s+function|async\s+function)\s+\w+/.exec(rest);
  return rest.slice(0, nextFn ? nextFn.index : rest.length);
}

test("every re-capped writer requires operate_venue (no bare guard left on it)", () => {
  const byFile = new Map<string, string>();
  for (const w of [...WRITERS, ...READS]) {
    if (!byFile.has(w.file)) byFile.set(w.file, read(w.file));
  }
  for (const w of WRITERS) {
    const src = byFile.get(w.file)!;
    const fnBody = body(src, w.fn);
    const direct = new RegExp(`requireWorkspaceStaffAction\\(\\{\\s*capability:\\s*"${escape(w.capability)}"\\s*\\}\\)`);
    // channels/pairing-actions.ts and server-actions/staff-resources.ts route
    // through a local helper that takes the capability as its own argument.
    const viaHelper = new RegExp(`(?:staff|requireBusinessWorkspace)\\("${escape(w.capability)}"\\)`);
    assert.ok(
      direct.test(fnBody) || viaHelper.test(fnBody),
      `${w.file}#${w.fn} must require ${w.capability} (directly or via its helper)`,
    );
    assert.doesNotMatch(
      fnBody,
      /requireWorkspaceStaffAction\(\s*\)|(?:staff|requireBusinessWorkspace)\(\s*\)/,
      `${w.file}#${w.fn} still has a capability-less guard call in its own body`,
    );
  }
});

test("the 3 unchanged WhatsApp pairing writes still require coordinate_inquiry", () => {
  const src = read("lib/channels/pairing-actions.ts");
  for (const fn of UNCHANGED_COORDINATE_WRITERS) {
    const fnBody = body(src, fn);
    assert.match(
      fnBody,
      new RegExp(`staff\\("${escape(COORDINATE)}"\\)`),
      `${fn} must still require ${COORDINATE} — only askOwnerToConnectWhatsApp moved to operate_venue`,
    );
  }
});

test("every read in these files keeps the viewer-held default", () => {
  for (const r of READS) {
    const src = read(r.file);
    const fnBody = body(src, r.fn);
    assert.match(
      fnBody,
      /requireWorkspaceStaffAction\(\s*\)|(?:staff|requireBusinessWorkspace)\(\s*\)/,
      `${r.file}#${r.fn} is a read and must keep the default capability`,
    );
  }
});

test("role matrix: viewer is refused on operate_venue, editor and up are allowed", () => {
  // agency.workspace.view (the unfixed default) is viewer-held — the
  // vulnerability the original TUL-1708 sweep closed.
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true);

  assert.equal(roleGrantsCapability("viewer", OPERATE_VENUE), false, "viewer must NOT hold operate_venue");
  for (const role of ["editor", "manager", "admin", "owner"] as const) {
    assert.equal(roleGrantsCapability(role, OPERATE_VENUE), true, `${role} must hold operate_venue`);
  }

  // coordinate_inquiry stays manager+ for the 3 unchanged pairing writes.
  assert.equal(roleGrantsCapability("viewer", COORDINATE), false);
  assert.equal(roleGrantsCapability("editor", COORDINATE), false, "editor must NOT hold coordinate_inquiry");
  assert.equal(roleGrantsCapability("manager", COORDINATE), true);
});
