/**
 * NO FIXED CALENDAR DATES THAT ROT, IN THE MONEY/SCHEDULING TESTS.
 *
 * `purchase-thread-calendar.test.ts` went red on main unnoticed (it ran in no
 * CI lane) and the order tests carried literals such as `2026-09-08` that were
 * "the future" when written and "the past" a few weeks later. Code that
 * compares a fixture date to the real clock then flips verdict with no code
 * change at all.
 *
 * RULE. A test file under src/lib/orders, src/lib/bookings or
 * src/lib/scheduling must not hard-code an ISO calendar date (YYYY-MM-DD) that
 * is already in the past or fewer than 30 days away, unless the file is on the
 * ALLOWLIST below because it PINS THE CLOCK (it feeds a fixed `now` to the code
 * under test, so the literal and the clock rot together or not at all).
 *
 * THIS GUARD IS DELIBERATELY TIME-DEPENDENT. A far-future literal (say
 * 2026-12-20) passes today and starts failing 30 days before it arrives. That
 * is the point: it is the warning that a fixture is about to cross into "now",
 * given while there is still a month to fix it, instead of a red main on the
 * day it expires.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { blankComments, WEB_ROOT } from "./supabase-unchecked-read";

const SCAN_DIRS = ["src/lib/orders", "src/lib/bookings", "src/lib/scheduling"] as const;
const TEST_FILE = /\.test\.tsx?$/;
const DATE_LITERAL = /\b(20\d\d)-(\d\d)-(\d\d)(?!\d)/g;
const HORIZON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tests whose fixed dates are safe because they pin the clock. Each entry
 * needs a one-line reason. Do NOT add a file because its dates "happen to
 * work today": that is exactly the rot this guard exists to catch.
 */
export const ALLOWLIST: Readonly<Record<string, string>> = {
  "src/lib/bookings/cancellation-window.test.ts": "pins NOW constant and feeds it as nowMs to the code under test",
  "src/lib/scheduling/load-busy.test.ts": "pins NOW constant and passes it as now to loadBusy",
  "src/lib/scheduling/inquiry-event-stamp.test.ts": "pure local-date and zone arithmetic over explicit stamps, never reads the clock",
  "src/lib/scheduling/tul-93-guest-confirmation.test.ts": "explicit booking stamps and an explicit `from` date are fed to the code; no clock comparison",
  "src/lib/scheduling/reservation-window.test.ts": "pins now and passes it to the reservation-window rules",
  "src/lib/scheduling/slots.test.ts": "pure timezone and DST arithmetic on explicit dates, never reads the clock",
  "src/lib/scheduling/tz.test.ts": "pure wall-clock and DST arithmetic on explicit dates, never reads the clock (would trip the guard 30 days before 2027-01-15)",
  "src/lib/scheduling/reservation-intent.test.ts": "pure conversion of an explicit starts_at/ends_at stamp, never reads the clock",
  "src/lib/scheduling/booking-reminder-window.test.ts": "pure predicate over explicit today/tomorrow arguments, never reads the clock",
  "src/lib/bookings/recurring.test.ts": "occurrences computed over an explicit date range argument, never reads the clock",
  "src/lib/bookings/manual-payment.test.ts": "earnings rows are keyed to the explicit month 2026-10 in the fixture; no clock comparison",
  "src/lib/orders/door-hold.test.ts": "pins NOW constant and passes it as now",
  "src/lib/orders/expire-orders.test.ts": "pins NOW constant; every other date is derived from it",
  "src/lib/bookings/booking-payment-sync.test.ts": "pins NOW as an explicit stamp argument",
  "src/lib/bookings/manage-token.test.ts": "pins now and passes it as nowMs to the token verifier",
  "src/lib/scheduling/reservation-slot-free.test.ts": "pins now and passes it to the slot-free rules",
  "src/lib/scheduling/cancel-booking.test.ts": "pins nowMs explicitly on each call",
  "src/lib/scheduling/booking-cancel-policy.test.ts": "pins nowMs (inside/outside) against a fixed start",
  "src/lib/scheduling/instant-book-gates.test.ts": "pins now (2026-03-09) and passes it to the gate",
  "src/lib/scheduling/next-free-times.test.ts": "pure list picker over explicit start strings, never reads the clock",
  "src/lib/scheduling/next-free-times-near.test.ts": "pure nearest-start picker over explicit strings, never reads the clock",
  "src/lib/scheduling/appointment-window.test.ts": "pure window arithmetic over explicit stamps, never reads the clock",
  "src/lib/scheduling/reschedule-booking.test.ts": "echoes a canned RPC reply; the wrapper under test does not read the clock",
  "src/lib/scheduling/reservation-convert-overlap.test.ts": "enrichBookingFromReservation echoes stamps; hold-expiry clock path is not exercised",
  "src/lib/scheduling/slot-conflict-two-customer.test.ts": "hold-insert error mapping over canned stamps, no clock comparison",
  "src/lib/scheduling/reservation-hold-self-busy.test.ts": "canned hold/booking stamps for post-insert TOCTOU overlap; no clock comparison",
  "src/lib/scheduling/instant-book-first-customer.test.ts": "runResolvedInstantBook echoes the reservation stamp; no clock comparison",
  "src/lib/scheduling/instant-book-guest.test.ts": "runResolvedInstantBook echoes the reservation stamp; no clock comparison",
  "src/lib/bookings/ledger-paid.test.ts": "canned paid_at values on ledger rows, never compared to the clock",
  "src/lib/bookings/quote-versions.test.ts": "canned accepted_at on a stored row, never compared to the clock",
};

export type DateHit = { readonly line: number; readonly literal: string };

/** ISO date literals in `source` that are in the past or within the horizon of `now`. */
export function findRottingDates(source: string, now: Date): DateHit[] {
  const cutoff = now.getTime() + HORIZON_DAYS * DAY_MS;
  const hits: DateHit[] = [];
  source.split("\n").forEach((text, i) => {
    for (const m of text.matchAll(DATE_LITERAL)) {
      const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (Number.isNaN(ms)) continue;
      if (ms < cutoff) hits.push({ line: i + 1, literal: m[0] });
    }
  });
  return hits;
}

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...testFiles(p));
    else if (TEST_FILE.test(e.name)) out.push(p);
  }
  return out;
}

test("no order/booking/scheduling test hard-codes a date that is past or near", () => {
  const now = new Date();
  const offenders: string[] = [];
  for (const d of SCAN_DIRS) {
    for (const abs of testFiles(join(WEB_ROOT, d))) {
      const rel = relative(WEB_ROOT, abs).split("\\").join("/");
      if (ALLOWLIST[rel]) continue;
      const hits = findRottingDates(blankComments(readFileSync(abs, "utf8")), now);
      if (hits.length > 0) {
        offenders.push(`  ${rel}: ${hits.map((h) => `${h.literal} (line ${h.line})`).slice(0, 4).join(", ")}${hits.length > 4 ? `, +${hits.length - 4} more` : ""}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `These tests hard-code a calendar date that is in the past or less than ${HORIZON_DAYS} days away.\n` +
      `Such a fixture silently changes meaning as the real clock moves. Either build the\n` +
      `dates relative to now (new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),\n` +
      `or pin the clock (inject a fixed NOW into the code under test) and add the file to\n` +
      `ALLOWLIST in src/lib/quality/test-fixed-dates.static.test.ts with a one-line reason.\n\n` +
      offenders.join("\n"),
  );
});

test("allowlist entries exist and carry a reason", () => {
  for (const [file, why] of Object.entries(ALLOWLIST)) {
    assert.ok(why.trim().length > 10, `${file}: allowlist entry needs a real reason`);
    assert.doesNotThrow(() => readFileSync(join(WEB_ROOT, file), "utf8"), `${file}: allowlisted file no longer exists`);
  }
});

test("GUARD BITES: the detector flags a past date, a near date, and spares a far one", () => {
  const now = new Date("2026-10-07T00:00:00Z");
  assert.equal(findRottingDates('const a = "2026-09-08T12:00:00Z";', now).length, 1);
  assert.equal(findRottingDates('const a = "2026-10-20";', now).length, 1);
  assert.equal(findRottingDates('const a = "2027-03-01";', now).length, 0);
});
