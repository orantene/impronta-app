/**
 * TUL-1708 (security sweep, area group D: bookings, reservations & appointments) —
 * held patch, applied on top of #4317 (operate_venue).
 *
 * PR #4328 moved every writer in this area off the capability-less default
 * (`agency.workspace.view`, viewer-reachable) onto a named capability. For
 * `scheduling/appointments-actions.ts` and four of the five `RESUME_VERBS` in
 * `_exceptions-actions.ts`, the PM-decided tier is `operate_venue` (editor+,
 * day-to-day venue/floor operation) rather than `coordinate_inquiry`
 * (manager+, deal/money coordination) — but `operate_venue` did not exist on
 * `main` at the time #4328 was authored, so this file is a patch held until
 * #4317 lands, re-targeting those writers.
 *
 * This test is self-contained (this worktree is cut from #4317's own SHA, not
 * from #4328), and proves, for the writers this patch touches:
 *   (1) no bare `requireWorkspaceStaffAction()` / `scopedTo(input.tenantId)` guard
 *       is left;
 *   (2) each writer now requires `operate_venue` (or, for the one money-moving
 *       verb, `booking.payment.refund`);
 *   (3) on the role matrix, a `viewer` is refused every capability this patch
 *       requires, while `editor` (for `operate_venue`) and `admin` (for
 *       `booking.payment.refund`) are allowed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { CapabilityKey } from "@/lib/access";
import { roleGrantsCapability } from "@/lib/access/roles";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sliceFn(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `could not find export async function ${name}`);
  const next = src.indexOf("export async function", start + 10);
  return next > 0 ? src.slice(start, next) : src.slice(start);
}

const BARE_SCOPED_TO = /\bscopedTo\(input\.tenantId\)/;
const BARE_GUARD = /\brequireWorkspaceStaffAction\(\s*\)/;

test("appointments-actions.ts: every writer requires operate_venue, not the bare default", () => {
  const src = stripComments(read("src/lib/scheduling/appointments-actions.ts"));
  const writers = [
    "rescheduleAppointment",
    "promoteFromWaitlist",
    "acceptWaitlistPlace",
    "releaseWaitlistPlace",
    "joinSessionWaitlist",
  ];
  for (const fn of writers) {
    const body = sliceFn(src, fn);
    assert.doesNotMatch(body, BARE_SCOPED_TO, `${fn} must not call scopedTo(input.tenantId) bare`);
    assert.match(
      body,
      /scopedTo\(input\.tenantId, false, "operate_venue"\)/,
      `${fn} must require operate_venue`,
    );
  }

  // Readers keep the capability-less default (shared guard or none).
  for (const fn of ["loadAppointments", "loadSessionWaitlists", "loadBookingHoursProposals"]) {
    const body = sliceFn(src, fn);
    assert.ok(
      /scopedTo\(tenantId, true\)/.test(body) || !/scopedTo\(/.test(body),
      `${fn} is documented as a read and must keep the capability-less default`,
    );
  }
});

test("_exceptions-actions.ts: resumeExceptionAction is gated per verb", () => {
  const src = stripComments(
    read("src/app/(workspace)/[tenantSlug]/admin/_exceptions-actions.ts"),
  );
  const body = sliceFn(src, "resumeExceptionAction");
  assert.doesNotMatch(body, BARE_GUARD, "resumeExceptionAction must not call requireWorkspaceStaffAction() bare");
  assert.match(
    body,
    /requireWorkspaceStaffAction\(\{\s*capability: RESUME_VERB_CAPABILITY\[input\.verb as ResumeVerb\],?\s*\}\)/,
    "resumeExceptionAction must guard with the per-verb capability map",
  );

  // The map itself: the refund verb is the one money-moving entry; the other
  // four are operate_venue.
  assert.match(src, /run_refund_intent:\s*"booking\.payment\.refund"/);
  for (const verb of [
    "mint_missing_admissions",
    "retry_engine_effect",
    "requeue_outbox_message",
    "recover_unresolved_collection",
  ]) {
    assert.match(src, new RegExp(`${verb}:\\s*"operate_venue"`));
  }
});

test("role matrix: viewer is refused every capability this patch requires; editor holds operate_venue, admin holds booking.payment.refund", () => {
  const required: CapabilityKey[] = ["operate_venue", "booking.payment.refund"];
  for (const cap of required) {
    assert.equal(roleGrantsCapability("viewer", cap), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap), true, `owner must hold ${cap}`);
  }
  assert.equal(roleGrantsCapability("editor", "operate_venue"), true, "editor must hold operate_venue");
  assert.equal(roleGrantsCapability("editor", "booking.payment.refund"), false, "editor must NOT hold booking.payment.refund");
  assert.equal(roleGrantsCapability("admin", "booking.payment.refund"), true, "admin must hold booking.payment.refund");
});
