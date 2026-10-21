/**
 * TUL-1708 (security sweep, area group D: bookings, reservations & appointments).
 *
 * `requireWorkspaceStaffAction()` with no `capability` defaults to `agency.workspace.view`,
 * which a `viewer` holds — so a WRITER that calls it bare lets a viewer write. This file
 * proves, for every writer across the nine files in this area, that:
 *   (1) no bare `requireWorkspaceStaffAction()` / `authorizeHours(id)` / `scopedTo(id)` guard
 *       is left on a writer (reads are explicitly exempted below, by name);
 *   (2) the capability it now passes is the one this PR's body documents;
 *   (3) on the role matrix, a `viewer` (and, where the bar is manager+, an `editor`) is
 *       refused every one of those capabilities, while the role the capability's own tier
 *       grants it to is allowed.
 *
 * There is no shared `capabilityless-staff-guard.*` ratchet on `main` yet (it ships with
 * #4288 / #4300, not merged as of this PR) — this test is self-contained so this area does
 * not depend on that landing first. See the "Acceptance" section of this PR's body for the
 * one-line follow-up once it does.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { CapabilityKey } from "@/lib/access";
import { roleGrantsCapability } from "@/lib/access/roles";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Strip comments so a capability named only in a doc comment can't fake a match.
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sliceFn(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `could not find export async function ${name}`);
  const next = src.indexOf("export async function", start + 10);
  return next > 0 ? src.slice(start, next) : src.slice(start);
}

type FileSpec = {
  path: string;
  /** Functions that keep the capability-less default (reads, or already-fixed writers). */
  reads: string[];
  /** Writer -> capability it must now pass to the guard. */
  writers: Record<string, CapabilityKey>;
  /** How the writer's capability call renders in source, once per writer name. */
  pattern: (fn: string, cap: CapabilityKey) => RegExp;
};

const BARE_GUARD = /\brequireWorkspaceStaffAction\(\s*\)/;

const FILES: FileSpec[] = [
  {
    path: "src/lib/server-actions/admin-bookings.ts",
    reads: [],
    writers: {
      updateBooking: "coordinate_inquiry",
      quickUpdateBookingPeek: "coordinate_inquiry",
      assignBookingToCurrentStaff: "coordinate_inquiry",
      patchBookingEntityLinks: "coordinate_inquiry",
      saveBookingTalentRow: "coordinate_inquiry",
      addBookingTalentRow: "coordinate_inquiry",
      deleteBookingTalentRow: "coordinate_inquiry",
      createManualBooking: "coordinate_inquiry",
      duplicateBooking: "coordinate_inquiry",
    },
    pattern: (fn) => new RegExp(`requireWorkspaceStaffAction\\(\\{ capability: ADMIN_BOOKINGS_CAPABILITY\\.${fn} \\}\\)`),
  },
  {
    path: "src/app/(workspace)/[tenantSlug]/admin/_alternates-actions.ts",
    reads: [],
    writers: {
      addAlternateAction: "coordinate_inquiry",
      removeAlternateAction: "coordinate_inquiry",
      reorderAlternatesAction: "coordinate_inquiry",
      promoteAlternateAction: "coordinate_inquiry",
    },
    pattern: () => /requireWorkspaceStaffAction\(\{ capability: "coordinate_inquiry" \}\)/,
  },
  {
    path: "src/app/(workspace)/[tenantSlug]/admin/_exceptions-actions.ts",
    reads: ["loadExceptionsInbox"],
    writers: {
      resumeExceptionAction: "booking.payment.refund",
      // resolvePaymentFlagAction already required "manage_billing" before this PR.
      resolvePaymentFlagAction: "manage_billing",
    },
    pattern: (_fn, cap) => new RegExp(`requireWorkspaceStaffAction\\(\\{ capability: "${cap}" \\}\\)`),
  },
  {
    path: "src/lib/server-actions/roster-direct-booking.ts",
    reads: ["loadRosterDirectBooking"],
    writers: {
      setRosterDirectBooking: "agency.roster.edit",
      // setRosterExternalBookingReleased already required "manage_agency_settings" before this PR.
      setRosterExternalBookingReleased: "manage_agency_settings",
    },
    pattern: (_fn, cap) => new RegExp(`requireWorkspaceStaffAction\\(\\{\\s*capability: "${cap}",?\\s*\\}\\)`),
  },
  {
    path: "src/lib/server-actions/appointments-settings-tenant.ts",
    reads: ["loadTenantAppointmentsSettings"],
    writers: {
      updateTenantAppointmentsSettings: "manage_agency_settings",
    },
    pattern: (_fn, cap) => new RegExp(`requireWorkspaceStaffAction\\(\\{ capability: "${cap}" \\}\\)`),
  },
  {
    path: "src/lib/server-actions/booking-hours.ts",
    // listBookingHoursTargets and loadBookingHours both keep the capability-less default.
    reads: ["listBookingHoursTargets", "loadBookingHours"],
    writers: {
      acceptBookingHoursProposal: "agency.roster.edit",
      saveBookingHours: "agency.roster.edit",
      setTalentDirectBookingOptIn: "agency.roster.edit",
    },
    // These three call the shared authorizeHours() helper, not the guard directly.
    pattern: (_fn, cap) => new RegExp(`authorizeHours\\(talentProfileId, "${cap}"\\)`),
  },
  {
    path: "src/lib/scheduling/appointments-actions.ts",
    reads: ["loadAppointments", "loadSessionWaitlists", "loadBookingHoursProposals"],
    writers: {
      rescheduleAppointment: "coordinate_inquiry",
      promoteFromWaitlist: "coordinate_inquiry",
      acceptWaitlistPlace: "coordinate_inquiry",
      releaseWaitlistPlace: "coordinate_inquiry",
      joinSessionWaitlist: "coordinate_inquiry",
    },
    // These five call the shared scopedTo() helper, not the guard directly.
    pattern: (_fn, cap) => new RegExp(`scopedTo\\(input\\.tenantId, false, "${cap}"\\)`),
  },
  // booking-policy-facts.ts and booking-policy-overrides-settings.ts have no writer at
  // all (both export a single read each) — nothing to fix, nothing to pin here.
];

for (const spec of FILES) {
  test(`${spec.path}: every writer passes its capability; every read keeps the default`, () => {
    const raw = read(spec.path);
    const src = stripComments(raw);

    for (const [fn, cap] of Object.entries(spec.writers)) {
      const body = sliceFn(src, fn);
      assert.doesNotMatch(body, BARE_GUARD, `${fn} must not call requireWorkspaceStaffAction() bare`);
      assert.match(body, spec.pattern(fn, cap), `${fn} must require ${cap}`);
    }
    for (const fn of spec.reads) {
      const body = sliceFn(src, fn);
      // A read may still call the shared guard/helper, but with no capability override.
      assert.ok(
        BARE_GUARD.test(body) ||
          /authorizeHours\(talentProfileId\);/.test(body) ||
          /scopedTo\((?:tenantId|input\.tenantId), true\);/.test(body) ||
          !/requireWorkspaceStaffAction|authorizeHours|scopedTo/.test(body),
        `${fn} is documented as a read and must keep the capability-less default`,
      );
    }
  });
}

test("behaviour on the role matrix: viewer is refused every capability area D now requires; the documented tier is allowed", () => {
  const required = new Set<CapabilityKey>();
  for (const spec of FILES) for (const cap of Object.values(spec.writers)) required.add(cap);

  // `agency.roster.edit` is editor+ (overlay availability data); `coordinate_inquiry` is
  // manager+; the rest are admin+. None of area D's writers is viewer-reachable.
  const editorPlus: CapabilityKey[] = ["agency.roster.edit"];
  const managerPlus: CapabilityKey[] = ["coordinate_inquiry"];
  const adminPlus: CapabilityKey[] = ["manage_agency_settings", "booking.payment.refund"];
  // manage_billing is owner-only (not even admin) in ROLE_CAPABILITIES.
  const ownerOnly: CapabilityKey[] = ["manage_billing"];

  for (const cap of required) {
    assert.equal(roleGrantsCapability("viewer", cap), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap), true, `owner must hold ${cap}`);
  }
  for (const cap of editorPlus) {
    assert.equal(roleGrantsCapability("editor", cap), true, `editor must hold ${cap}`);
  }
  for (const cap of managerPlus) {
    assert.equal(roleGrantsCapability("editor", cap), false, `editor must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("manager", cap), true, `manager must hold ${cap}`);
  }
  for (const cap of adminPlus) {
    assert.equal(roleGrantsCapability("manager", cap), false, `manager must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("admin", cap), true, `admin must hold ${cap}`);
  }
  for (const cap of ownerOnly) {
    assert.equal(roleGrantsCapability("admin", cap), false, `admin must NOT hold ${cap}`);
  }
  // The viewer default itself still reads everywhere these writers live.
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true);
});
