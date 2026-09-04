import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROCESSING_RATE,
  isNoShowNow,
  isWithinFreeCancellation,
  splitForfeiture,
} from "./forfeiture";

test("the platform takes ZERO commission on a penalty, and the zero is a NUMBER", () => {
  // Not an omission. A reader asking "what did the platform take" should find a
  // 0 rather than an absence they have to interpret.
  const s = splitForfeiture(2000);
  assert.equal(s.commissionCents, 0);
  assert.ok("commissionCents" in s);
});

test("the tenant nets the processing fee, and the numbers add up", () => {
  const s = splitForfeiture(2000); // $20 deposit
  assert.equal(s.chargeCents, 2000);
  assert.equal(s.processingFeeCents, 88); // ceil(2000 * 0.029) = 58, + 30
  assert.equal(s.transferCents, 1912);
  assert.equal(s.transferCents + s.processingFeeCents + s.commissionCents, s.chargeCents);
});

test("the processing fee rounds UP, because Stripe does", () => {
  // A platform that rounds down pays the difference on every transaction,
  // forever, on the one flow whose volume rises when customers behave badly.
  const s = splitForfeiture(1005); // 1005 * 0.029 = 29.145
  assert.equal(s.processingFeeCents, 30 + 30);
});

test("a forfeiture smaller than its fee transfers nothing, never a negative", () => {
  // A bare subtraction here invents a debt the tenant owes us.
  const s = splitForfeiture(20);
  assert.equal(s.processingFeeCents, 20);
  assert.equal(s.transferCents, 0);
  assert.ok(s.transferCents >= 0);
});

test("a zero or nonsense amount splits into all zeroes and never throws", () => {
  for (const bad of [0, -100, 1.5, Number.NaN]) {
    const s = splitForfeiture(bad as number);
    assert.deepEqual(s, {
      chargeCents: 0,
      processingFeeCents: 0,
      transferCents: 0,
      commissionCents: 0,
    });
  }
});

test("the rate is injectable, so a pricing change is not a code change", () => {
  const s = splitForfeiture(10_000, { percentBps: 250, fixedCents: 0 });
  assert.equal(s.processingFeeCents, 250);
  assert.equal(s.transferCents, 9750);
  assert.equal(DEFAULT_PROCESSING_RATE.percentBps, 290);
});

// ─── no-show detection ───────────────────────────────────────────────────────

const AT = new Date("2026-09-06T01:00:00Z"); // Sat 5 Sept, 20:00 Cancun (UTC-5)

test("NOT YET ARRIVED and NEVER CAME are told apart by the grace period alone", () => {
  // They are identical in admitted_count, which is the whole reason no_show_at
  // is a stamp rather than something derived from a count.
  const base = { startsAt: AT, admittedCount: 0, graceMinutes: 30, noShowAt: null };
  assert.equal(
    isNoShowNow({ ...base, now: new Date(AT.getTime() + 20 * 60_000) }),
    false,
    "twenty minutes late is late, not a no-show",
  );
  assert.equal(
    isNoShowNow({ ...base, now: new Date(AT.getTime() + 31 * 60_000) }),
    true,
    "past the grace period with nobody arrived is a no-show",
  );
});

test("exactly on the grace deadline is NOT yet a no-show", () => {
  assert.equal(
    isNoShowNow({
      startsAt: AT,
      admittedCount: 0,
      graceMinutes: 30,
      noShowAt: null,
      now: new Date(AT.getTime() + 30 * 60_000),
    }),
    false,
  );
});

test("a PART-arrived party is never a no-show, however late the rest are", () => {
  // Two of four at 20:00 and the rest at 20:40. Charging that party a no-show
  // fee while they sit at the table is the worst thing this feature could do.
  assert.equal(
    isNoShowNow({
      startsAt: AT,
      admittedCount: 2,
      graceMinutes: 30,
      noShowAt: null,
      now: new Date(AT.getTime() + 120 * 60_000),
    }),
    false,
  );
});

test("an already-marked no-show is not marked twice", () => {
  // Idempotence at the decision layer, so a re-run of the grace job cannot
  // charge a card a second time.
  assert.equal(
    isNoShowNow({
      startsAt: AT,
      admittedCount: 0,
      graceMinutes: 30,
      noShowAt: new Date(AT.getTime() + 31 * 60_000),
      now: new Date(AT.getTime() + 90 * 60_000),
    }),
    false,
  );
});

// ─── free cancellation ───────────────────────────────────────────────────────

test("exactly on the free-cancellation deadline is still FREE", () => {
  // A guest who cancels at the stated hour and is charged anyway will dispute
  // it, and they will be right.
  assert.equal(
    isWithinFreeCancellation({
      startsAt: AT,
      freeCancelHours: 2,
      now: new Date(AT.getTime() - 2 * 3_600_000),
    }),
    true,
  );
  assert.equal(
    isWithinFreeCancellation({
      startsAt: AT,
      freeCancelHours: 2,
      now: new Date(AT.getTime() - 2 * 3_600_000 + 1000),
    }),
    false,
  );
});

test("a zero free-cancellation window still lets a guest cancel before the time", () => {
  assert.equal(
    isWithinFreeCancellation({ startsAt: AT, freeCancelHours: 0, now: new Date(AT.getTime() - 1) }),
    true,
  );
  assert.equal(
    isWithinFreeCancellation({ startsAt: AT, freeCancelHours: 0, now: new Date(AT.getTime() + 1) }),
    false,
  );
});
