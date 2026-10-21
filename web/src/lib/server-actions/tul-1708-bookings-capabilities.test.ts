/**
 * TUL-1708 (security sweep, area group D: bookings, reservations & appointments).
 *
 * `requireWorkspaceStaffAction()` with no `capability` defaults to `agency.workspace.view`,
 * which a `viewer` holds — so a WRITER that calls it bare lets a viewer write. This file
 * proves, for every writer in this area (except `booking-hours.ts`, which a separate
 * hardening session owns and this PR does not touch, and `appointments-actions.ts`, held
 * as a patch on top of #4317 — see below), that:
 *   (1) no bare `requireWorkspaceStaffAction()` / `authorizeHours(id)` / `scopedTo(id)` guard
 *       is left on a writer (reads are explicitly exempted below, by name);
 *   (2) the capability it now passes is the one this PR's body documents;
 *   (3) on the role matrix, a `viewer` (and, where the bar is manager+, an `editor`) is
 *       refused every one of those capabilities, while the role the capability's own tier
 *       grants it to is allowed.
 *
 * PM revision: `_alternates-actions.ts` is roster-editing (editor-tier
 * `agency.roster.edit`), not deal/money coordination (manager-tier
 * `coordinate_inquiry`) — `admin-bookings.ts` stays on `coordinate_inquiry` across the
 * board (booking create/convert/cancel is manager-tier). `resumeExceptionAction` is
 * gated per verb, not with one flat capability — see the dedicated block below.
 *
 * `appointments-actions.ts`'s five writers (reschedule/waitlist) are PM-decided
 * `operate_venue` (editor-tier floor operations), but `operate_venue` ships with #4317,
 * not yet on `main` — so that file is untouched here and the swap is a held patch
 * applied on top of #4317's own commit once it lands. This test does not cover it.
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
      addAlternateAction: "agency.roster.edit",
      removeAlternateAction: "agency.roster.edit",
      reorderAlternatesAction: "agency.roster.edit",
      promoteAlternateAction: "agency.roster.edit",
    },
    pattern: () => /requireWorkspaceStaffAction\(\{ capability: "agency\.roster\.edit" \}\)/,
  },
  {
    path: "src/app/(workspace)/[tenantSlug]/admin/_exceptions-actions.ts",
    // resumeExceptionAction is gated per verb, not with one flat capability, and is
    // neither a plain read nor a single-capability writer — see the dedicated
    // "resumeExceptionAction is gated per verb" test block below instead.
    reads: ["loadExceptionsInbox"],
    writers: {
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
  // booking-hours.ts is NOT in this sweep: a separate hardening session owns that file
  // (a cross-tenant P1 in progress there), and this PR does not touch it. It stays on
  // its pre-sweep bare `requireWorkspaceStaffAction()` / `authorizeHours(id)` guards.
  //
  // appointments-actions.ts's five writers (reschedule/waitlist) are PM-decided
  // operate_venue, which ships with #4317 (not yet on main) — untouched here, fixed by
  // a held patch applied once #4317 lands. See the file header.
  //
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
  // resumeExceptionAction's capabilities are not pulled from `FILES` (it is gated per
  // verb, not with one flat capability) — pinned in explicitly so this block still
  // covers every capability area D requires.
  required.add("coordinate_inquiry");
  required.add("booking.payment.refund");

  // `agency.roster.edit` is editor+ (overlay availability data / roster editing,
  // which now includes the alternates-actions writers); `coordinate_inquiry` is
  // manager+ (deal/money coordination — admin-bookings.ts stays here, and
  // resumeExceptionAction's four non-refund verbs are pinned here as an interim
  // placeholder, no looser than before, until the operate_venue patch lands); the
  // rest are admin+. None of area D's writers is viewer-reachable.
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

/**
 * resumeExceptionAction does not fit the generic FILES loop above: its capability
 * depends on `input.verb`, not one fixed guard call. `run_refund_intent` is the one
 * money-moving verb (booking.payment.refund, admin+); the other four are floor
 * operations pinned to `coordinate_inquiry` (manager+, no looser than the flat
 * capability this file used before this PR) as an interim placeholder until a held
 * patch on top of #4317 swaps them to `operate_venue` (editor+) — see the file header.
 */
test("_exceptions-actions.ts: resumeExceptionAction is gated per verb, not with one flat capability", () => {
  const raw = read("src/app/(workspace)/[tenantSlug]/admin/_exceptions-actions.ts");
  const src = stripComments(raw);
  const body = sliceFn(src, "resumeExceptionAction");
  assert.doesNotMatch(body, BARE_GUARD, "resumeExceptionAction must not call requireWorkspaceStaffAction() bare");
  assert.match(
    body,
    /requireWorkspaceStaffAction\(\{\s*capability: RESUME_VERB_CAPABILITY\[input\.verb as ResumeVerb\],?\s*\}\)/,
    "resumeExceptionAction must guard with the per-verb capability map",
  );

  assert.match(src, /run_refund_intent:\s*"booking\.payment\.refund"/);
  for (const verb of [
    "mint_missing_admissions",
    "retry_engine_effect",
    "requeue_outbox_message",
    "recover_unresolved_collection",
  ]) {
    assert.match(
      src,
      new RegExp(`${verb}:\\s*"coordinate_inquiry"`),
      `${verb} must be pinned to coordinate_inquiry pending the operate_venue patch`,
    );
    assert.match(
      raw,
      new RegExp(`// TUL-1708: swapped to operate_venue once #4317 lands\\s*\\n\\s*${verb}:`),
      `${verb} must carry the pending-swap comment`,
    );
  }
});
