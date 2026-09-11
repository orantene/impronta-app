/**
 * Moving an INSTANT booking moves its person.
 *
 * Proved in a browser on 2026-09-10: the board said "Moved to Sat, Sep 12"
 * and the manicurist's `talent_holds` row stayed on Thursday, because
 * `reschedule_booking_set` reached person legs only through an inquiry's
 * `talent_bookings` mirror, and a public-page booking has neither. The
 * replacement in 20261231030700 moves every firm hold keyed to the booking's
 * order, and relies on `talent_holds_firm_no_overlap` (an EXCLUDE constraint)
 * to refuse a destination the person already has, so the desk can name them.
 *
 * These assertions read the migration itself, comments stripped, in the way
 * `reschedule-booking-set.static.test.ts` reads T1-02: a migration's own proof
 * block runs once at apply time and can never catch a regression.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS = resolve(WEB_ROOT, "..", "supabase", "migrations");
const FILE = "20261231030700_reschedule_moves_order_holds.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const lower = sql.toLowerCase();

const body = (() => {
  const start = lower.indexOf("create or replace function public.reschedule_booking_set");
  assert.ok(start >= 0, "the migration must replace reschedule_booking_set");
  const end = lower.indexOf("revoke all on function", start);
  assert.ok(end > start, "the migration must revoke the function it defines");
  return lower.slice(start, end);
})();

/** Comments stripped, so prose about a rule cannot stand in for the rule. */
const code = body
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

test("the holds of the booking's order are selected by the key the purchase wrote", () => {
  const select = code.indexOf("select th.*");
  assert.ok(select >= 0, "the function must read the order's holds (select th.* from talent_holds)");
  const loopEnd = code.indexOf("end loop", select);
  const leg = code.slice(select, loopEnd);
  assert.ok(
    leg.includes("th.operation_key = 'order:' || v_booking.order_id::text || ':reserve'"),
    "the holds must be keyed to the order exactly as reserve_resource_set_v2 wrote them",
  );
  assert.ok(leg.includes("th.hold_strength = 'firm'"), "only firm holds are a person's calendar");
  assert.ok(leg.includes("for update"), "each hold must be locked before it is moved");
  assert.ok(
    leg.includes("update public.talent_holds") && leg.includes("set starts_at = v_hold_start"),
    "the hold must be MOVED, not deleted and re-inserted, so its identity and expiry survive",
  );
});

test("the person is named before the move that can be refused", () => {
  const leg = code.slice(code.indexOf("select th.*"));
  const named = leg.indexOf("v_failed_talent := v_hold.talent_profile_id");
  const moved = leg.indexOf("update public.talent_holds");
  assert.ok(named >= 0 && moved > named, "v_failed_talent must be set before the UPDATE raises");
  // The exclusion handler is what turns the raise into a sentence. Without it
  // the desk would read `unavailable` and could name nobody.
  assert.ok(
    code.includes("when exclusion_violation then") &&
      code.slice(code.indexOf("when exclusion_violation then")).includes("'failed_talent_id', v_failed_talent"),
    "an exclusion violation must return slot_taken with the person that caused it",
  );
});

test("a wider hold shifts by the delta and keeps its own length", () => {
  const leg = code.slice(code.indexOf("select th.*"), code.indexOf("end loop", code.indexOf("select th.*")));
  assert.ok(leg.includes("v_shift      := p_starts_at - v_prev_starts") || leg.includes("v_shift := p_starts_at - v_prev_starts"));
  assert.ok(leg.includes("v_hold_start := v_hold.starts_at + v_shift"), "a buffered hold must shift, not be rewritten to the bare window");
  assert.ok(leg.includes("v_hold_end   := v_hold.ends_at + v_shift") || leg.includes("v_hold_end := v_hold.ends_at + v_shift"));
});

test("the order legs run after the capacity legs and before the parent is written, inside the one transaction", () => {
  const holds = code.indexOf("select th.*");
  const capacity = code.indexOf("from public.capacity_allocations a");
  const parent = code.indexOf("update public.agency_bookings");
  assert.ok(holds >= 0 && parent > holds, "the person must move before the booking says it moved");
  // Room first, so a destination where both the room and the person are
  // taken is refused naming the room; a booking with no room still names the
  // person. Only the reported refusal depends on this order.
  assert.ok(capacity >= 0 && capacity < holds, "the person legs must run after the capacity legs");
  assert.ok(lower.trimStart().replace(/^--.*\n/gm, "").includes("begin;"), "the migration must run as one transaction");
});

test("the reply says how many person legs of each kind moved", () => {
  assert.ok(code.includes("'moved_holds', v_moved_holds"), "moved_holds must be reported");
  assert.ok(code.includes("'moved_talent_bookings', v_moved_talent"), "the inquiry legs are still reported");
});

test("the function stays service-role only", () => {
  assert.ok(lower.includes("revoke all on function public.reschedule_booking_set"));
  assert.ok(lower.includes("from public, anon, authenticated"));
  assert.ok(lower.includes("to service_role"));
});
