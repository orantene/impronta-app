/**
 * TUL-1708 (security sweep, area I: calendar, POS support helpers & venue).
 *
 * Eight write actions across 7 files called `requireWorkspaceStaffAction()` (or the
 * local `staff()` / `requireBusinessWorkspace()` aliases) with NO capability, which
 * defaults to `agency.workspace.view` — a capability the viewer role holds. A viewer
 * could mint/kill a calendar sync feed, place/release a talent hold, mark a product
 * order fulfilled (releasing its deferred payout), flip the support-replay-buffer
 * setting, create/archive a business staff resource, pair/unlink WhatsApp, or edit
 * venue settings.
 *
 * This is a self-contained test (no `capabilityless-staff-guard.*` ratchet dependency —
 * that infra ships with #4288/#4300, not yet on main): static source assertions that
 * every writer below now passes its capability, that no bare guard remains on a writer,
 * and that reads keep the default; plus the role matrix for each capability used.
 *
 * `pos-modes.ts` and `pos-location-facts.ts` are deliberately NOT in this file:
 * pos-modes.ts's writers already require `manage_billing` (fixed before this sweep),
 * and pos-location-facts.ts has no writer at all — see the PR body.
 * `catalog-engine-reads.ts` is also excluded: both its exports are reads.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";
import type { CapabilityKey } from "@/lib/access/capabilities";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, "src", p), "utf8");

const ROSTER_EDIT = "agency.roster.edit" as const; // editor+
const SETTINGS = "manage_agency_settings" as const; // admin+
const MARK_RECEIVED = "booking.payment.mark_received" as const; // admin+
const MANAGE_ROSTER = "manage_talent_roster" as const; // manager+
const COORDINATE = "coordinate_inquiry" as const; // manager+

function escape(cap: string): string {
  return cap.replace(/\./g, "\\.");
}

/** Every writer this PR fixed, and the capability it must now require. */
const WRITERS: Array<{ file: string; fn: string; capability: CapabilityKey }> = [
  { file: "lib/calendar/feed-actions.ts", fn: "issueCalendarFeedUrl", capability: ROSTER_EDIT },
  { file: "lib/calendar/feed-actions.ts", fn: "disconnectCalendarFeed", capability: ROSTER_EDIT },
  { file: "lib/talent-calendar/hold-actions.ts", fn: "placeTalentHold", capability: ROSTER_EDIT },
  { file: "lib/talent-calendar/hold-actions.ts", fn: "releaseTalentHold", capability: ROSTER_EDIT },
  { file: "lib/talent/fulfillment-actions.ts", fn: "authorizeForBooking", capability: MARK_RECEIVED },
  { file: "lib/support/replay/replay-actions.ts", fn: "saveSupportReplayBufferSetting", capability: SETTINGS },
  { file: "lib/server-actions/staff-resources.ts", fn: "createStaffResource", capability: MANAGE_ROSTER },
  { file: "lib/server-actions/staff-resources.ts", fn: "archiveStaffResource", capability: MANAGE_ROSTER },
  { file: "lib/channels/pairing-actions.ts", fn: "startWhatsAppPairing", capability: COORDINATE },
  { file: "lib/channels/pairing-actions.ts", fn: "requestWhatsAppPairingCode", capability: COORDINATE },
  { file: "lib/channels/pairing-actions.ts", fn: "unlinkWhatsApp", capability: COORDINATE },
  { file: "lib/channels/pairing-actions.ts", fn: "askOwnerToConnectWhatsApp", capability: COORDINATE },
  { file: "lib/server-actions/venue-settings.ts", fn: "updateVenueSettings", capability: SETTINGS },
];

/** Every read this PR deliberately left on the viewer-held default. */
const READS: Array<{ file: string; fn: string }> = [
  { file: "lib/talent/fulfillment-actions.ts", fn: "loadTalentOrders" },
  { file: "lib/support/replay/replay-actions.ts", fn: "loadSupportReplayBufferSetting" },
  { file: "lib/server-actions/staff-resources.ts", fn: "listStaffResources" },
  { file: "lib/channels/pairing-actions.ts", fn: "loadWhatsAppConnection" },
  { file: "lib/server-actions/venue-settings.ts", fn: "loadVenueSettings" },
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

test("every fixed writer requires its capability (no bare guard left on it)", () => {
  const byFile = new Map<string, string>();
  for (const w of [...WRITERS, ...READS]) {
    if (!byFile.has(w.file)) byFile.set(w.file, read(w.file));
  }
  for (const w of WRITERS) {
    const src = byFile.get(w.file)!;
    const fnBody = body(src, w.fn);
    const direct = new RegExp(`requireWorkspaceStaffAction\\(\\{\\s*capability:\\s*"${escape(w.capability)}"\\s*\\}\\)`);
    // The channels/staff-resources files route through a local helper that takes the
    // capability as its own argument instead of building the options object inline.
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

test("every read this PR touched keeps the viewer-held default", () => {
  for (const r of READS) {
    const src = read(r.file);
    const fnBody = body(src, r.fn);
    // A read either calls the guard bare directly, or (fulfillment-actions'
    // loadTalentOrders, pairing-actions' loadWhatsAppConnection) calls a bare
    // staff/guard helper with no capability argument.
    assert.match(
      fnBody,
      /requireWorkspaceStaffAction\(\s*\)|(?:staff|requireBusinessWorkspace)\(\s*\)/,
      `${r.file}#${r.fn} is a read and must keep the default capability`,
    );
  }
});

test("role matrix: viewer is refused on every capability used; the granting tier is allowed", () => {
  // agency.workspace.view (the unfixed default) is viewer-held — the vulnerability
  // this whole PR closes.
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true);

  for (const cap of [ROSTER_EDIT]) {
    assert.equal(roleGrantsCapability("viewer", cap), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("editor", cap), true, `editor must hold ${cap}`);
  }
  for (const cap of [MANAGE_ROSTER, COORDINATE]) {
    assert.equal(roleGrantsCapability("viewer", cap), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("editor", cap), false, `editor must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("manager", cap), true, `manager must hold ${cap}`);
  }
  for (const cap of [SETTINGS, MARK_RECEIVED]) {
    assert.equal(roleGrantsCapability("viewer", cap), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("editor", cap), false, `editor must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("manager", cap), false, `manager must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("admin", cap), true, `admin must hold ${cap}`);
  }
  for (const cap of [ROSTER_EDIT, MANAGE_ROSTER, COORDINATE, SETTINGS, MARK_RECEIVED]) {
    assert.equal(roleGrantsCapability("owner", cap), true, `owner must hold ${cap}`);
  }
});

test("pairing-actions' canPairWhatsApp role gate and coordinate_inquiry agree on the bar", () => {
  // startWhatsAppPairing/requestWhatsAppPairingCode/unlinkWhatsApp already checked
  // `canPairWhatsApp(role)` (owner|admin|manager) before this PR; coordinate_inquiry
  // is manager+, so this PR's capability gate tightens nothing for those three and
  // only closes the real gap, askOwnerToConnectWhatsApp (which had no check at all).
  const src = read("lib/channels/pairing-actions.ts");
  assert.match(src, /canPairWhatsApp\(role: string \| null \| undefined\)|canPairWhatsApp/);
  assert.equal(roleGrantsCapability("manager", COORDINATE), true);
  assert.equal(roleGrantsCapability("editor", COORDINATE), false);
});
