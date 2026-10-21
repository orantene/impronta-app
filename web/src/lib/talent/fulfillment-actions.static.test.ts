/**
 * TUL-1708 #4355 follow-up (consultant spec): `markBookingFulfillment`'s staff
 * path is gated on `operate_venue` (editor+) in `authorizeForBooking` — fine
 * for most status changes, but the HANDED_OFF_STATES transition also calls
 * `executeBookingTransfers`, releasing the deferred product payout. Money in
 * motion needs the MANAGER-tier `booking.payment.request`, same bar as every
 * other payment-request action in `pipeline-write-capabilities.ts`.
 *
 * Source-pin test (mock.module is unusable under tsx, per the repo's own
 * workspace-money-gates.test.ts note): pins that the extra gate
 *   - runs only on the staff path (`auth.via === "staff"`), never for the
 *     talent-owner path,
 *   - is scoped to `HANDED_OFF_STATES`, not every status,
 *   - asks for `booking.payment.request` with the same tenant-equality shape
 *     as `authorizeForBooking`'s own `operate_venue` check,
 *   - runs BEFORE `upsertBookingFulfillment` (and so before
 *     `executeBookingTransfers`, which only runs after that upsert succeeds).
 * Plus the role matrix: editor fails `booking.payment.request`, manager+ pass.
 *
 * Run: npx tsx --test src/lib/talent/fulfillment-actions.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "fulfillment-actions.ts"), "utf8");

function body(src: string, fn: string): string {
  const re = new RegExp(`(?:export\\s+async\\s+function|async\\s+function)\\s+${fn}\\b`);
  const m = re.exec(src);
  assert.ok(m, `${fn} must exist`);
  const start = m!.index;
  const rest = src.slice(start + m![0].length);
  const next = /(?:export\s+async\s+function|async\s+function)\s+\w+/.exec(rest);
  return rest.slice(0, next ? next.index : rest.length);
}

test("authorizeForBooking: the owner path and the staff path each return a distinct `via`", () => {
  const fn = body(SRC, "authorizeForBooking");
  assert.match(fn, /ok:\s*true,\s*tenantId:\s*booking\.tenant_id\s*\?\?\s*null,\s*talentProfileId,\s*via:\s*"owner"/);
  assert.match(fn, /ok:\s*true,\s*tenantId:\s*booking\.tenant_id\s*\?\?\s*null,\s*talentProfileId,\s*via:\s*"staff"/);
});

test("markBookingFulfillment: the handed-off capability gate is scoped to the staff path and HANDED_OFF_STATES", () => {
  const fn = body(SRC, "markBookingFulfillment");
  const gateAt = fn.search(/auth\.via === "staff" && HANDED_OFF_STATES\.includes\(input\.status\)/);
  assert.ok(gateAt >= 0, "must check auth.via === \"staff\" && HANDED_OFF_STATES.includes(input.status)");
});

test("markBookingFulfillment: the handed-off gate asks for booking.payment.request with the same tenant-equality shape as authorizeForBooking's own guard", () => {
  const fn = body(SRC, "markBookingFulfillment");
  assert.match(
    fn,
    /requireWorkspaceStaffAction\(\{\s*capability:\s*"booking\.payment\.request"\s*\}\)/,
    "must request booking.payment.request (manager-tier, same bar as every other payment-request action)",
  );
  assert.match(
    fn,
    /!handoff\.ok \|\| handoff\.tenantId !== auth\.tenantId/,
    "must refuse on a tenant mismatch, same shape as authorizeForBooking's staff-path check",
  );
});

test("markBookingFulfillment: the handed-off gate runs before upsertBookingFulfillment (and so before executeBookingTransfers)", () => {
  const fn = body(SRC, "markBookingFulfillment");
  const gateIdx = fn.indexOf('requireWorkspaceStaffAction({ capability: "booking.payment.request" })');
  const upsertIdx = fn.indexOf("await upsertBookingFulfillment(");
  const transferIdx = fn.indexOf("await executeBookingTransfers(");
  assert.ok(gateIdx >= 0 && upsertIdx >= 0 && transferIdx >= 0, "all three calls must be present");
  assert.ok(gateIdx < upsertIdx, "the handed-off gate must run before upsertBookingFulfillment");
  assert.ok(upsertIdx < transferIdx, "the payout transfer must only run after the upsert");
});

test("role matrix: editor fails booking.payment.request, manager and up pass", () => {
  assert.equal(roleGrantsCapability("viewer", "booking.payment.request"), false);
  assert.equal(roleGrantsCapability("editor", "booking.payment.request"), false, "editor must NOT hold booking.payment.request");
  for (const role of ["manager", "admin", "owner"] as const) {
    assert.equal(roleGrantsCapability(role, "booking.payment.request"), true, `${role} must hold booking.payment.request`);
  }
  // Editor does hold operate_venue, the bar for every non-handed-off status.
  assert.equal(roleGrantsCapability("editor", "operate_venue"), true, "editor must still hold operate_venue for non-handed-off statuses");
});
