import assert from "node:assert/strict";
import test from "node:test";

import { deactivateIfExpiredWith } from "./expire-stale-discount";
import { discountStatus, localizeWindowIssue, windowErrorMessage, WINDOW_ERROR_PREFIX } from "./discount-status";

const NOW = Date.parse("2026-10-22T06:15:00Z");
const base = { isActive: true, startsAt: null, endsAt: null, stripePromotionCodeId: "promo_1" as string | null };

function deps(ok = true) {
  const calls: Array<string | null> = [];
  return {
    calls,
    d: {
      swept: new Set<string>(),
      archive: async (i: { stripePromotionCodeId: string | null }) => {
        calls.push(i.stripePromotionCodeId);
        return { ok };
      },
    },
  };
}

test("TUL-1860: an expired code has its Stripe promotion code switched off, once", async () => {
  const { calls, d } = deps();
  const expired = { ...base, endsAt: "2026-10-22T06:08:00Z" };
  assert.equal(await deactivateIfExpiredWith(d, expired, NOW), true);
  assert.equal(await deactivateIfExpiredWith(d, expired, NOW), false); // swept: no second Stripe call
  assert.deepEqual(calls, ["promo_1"]);
});

test("a live, scheduled, archived or unlinked code is left alone", async () => {
  const { calls, d } = deps();
  assert.equal(await deactivateIfExpiredWith(d, { ...base, endsAt: "2026-10-23T00:00:00Z" }, NOW), false);
  assert.equal(await deactivateIfExpiredWith(d, { ...base, startsAt: "2026-10-23T00:00:00Z" }, NOW), false);
  assert.equal(await deactivateIfExpiredWith(d, { ...base, isActive: false, endsAt: "2026-10-01T00:00:00Z" }, NOW), false);
  assert.equal(await deactivateIfExpiredWith(d, { ...base, stripePromotionCodeId: null, endsAt: "2026-10-01T00:00:00Z" }, NOW), false);
  assert.deepEqual(calls, []);
});

test("a Stripe failure is retried on the next use", async () => {
  const { calls, d } = deps(false);
  const expired = { ...base, endsAt: "2026-10-22T06:08:00Z" };
  assert.equal(await deactivateIfExpiredWith(d, expired, NOW), false);
  assert.equal(await deactivateIfExpiredWith(d, expired, NOW), false);
  assert.equal(calls.length, 2);
});

test("an unparseable date fails closed instead of reading as no limit", () => {
  assert.equal(discountStatus({ isActive: true, startsAt: null, endsAt: "not a date" }, NOW), "expired");
  assert.equal(discountStatus({ isActive: true, startsAt: "nope", endsAt: null }, NOW), "scheduled");
});

test("TUL-1873: a window error shows only the viewer's language", () => {
  const es = localizeWindowIssue(`${WINDOW_ERROR_PREFIX}endInPast`, "es-MX");
  const en = localizeWindowIssue(`${WINDOW_ERROR_PREFIX}endInPast`, "en");
  assert.equal(es, "La fecha de fin ya pasó. Elige una fecha futura.");
  assert.equal(en, "The end date is in the past. Pick a future date.");
  assert.doesNotMatch(es, /\/ The/);
  assert.doesNotMatch(en, / \/ La/);
  assert.equal(windowErrorMessage("startAfterEnd", null), "The start date must be before the end date.");
  assert.equal(localizeWindowIssue("Percent must be 1-100.", "es"), "Percent must be 1-100.");
});
