import { test } from "node:test";
import assert from "node:assert/strict";

import type { EnforceRoleLimitResult } from "@/lib/approvals/enforce";
import {
  REFUND_AUTHORITY_CODES,
  authorizeRefund,
  checkRefundAmount,
  planOwnBookingRefund,
  refundAuthorityMessage,
  talentMayRefundOwnBooking,
} from "./refund-authority";

/**
 * TUL-1268 M6: one guard in front of every refund. These are the cases the
 * PR body lists; each row is (capable, requested, refundable, role limit) and
 * the verdict the guard must reach.
 */

function limitSpy(result: EnforceRoleLimitResult = { ok: true }) {
  const calls: number[] = [];
  return {
    calls,
    enforceLimit: async (amountCents: number) => {
      calls.push(amountCents);
      return result;
    },
  };
}

test("not capable: refused before the amount is even read, limit never consulted", async () => {
  const spy = limitSpy();
  const out = await authorizeRefund({
    capable: false,
    requestedCents: 1000,
    refundableCents: 5000,
    allowFullRemainder: true,
    enforceLimit: spy.enforceLimit,
  });
  assert.deepEqual(out.ok, false);
  if (out.ok) return;
  assert.equal(out.code, "not_allowed");
  assert.equal(spy.calls.length, 0);
});

const amountCases: Array<{
  name: string;
  requested: number | null;
  refundable: number;
  allowFull: boolean;
  expect: { ok: true; amountCents: number } | { ok: false; code: string };
}> = [
  { name: "partial inside the remainder", requested: 2500, refundable: 5000, allowFull: true, expect: { ok: true, amountCents: 2500 } },
  { name: "exactly the remainder", requested: 5000, refundable: 5000, allowFull: true, expect: { ok: true, amountCents: 5000 } },
  { name: "one cent over the remainder", requested: 5001, refundable: 5000, allowFull: true, expect: { ok: false, code: "over_remainder" } },
  { name: "zero", requested: 0, refundable: 5000, allowFull: true, expect: { ok: false, code: "invalid_amount" } },
  { name: "negative", requested: -100, refundable: 5000, allowFull: true, expect: { ok: false, code: "invalid_amount" } },
  { name: "fractional cents", requested: 10.5, refundable: 5000, allowFull: true, expect: { ok: false, code: "invalid_amount" } },
  { name: "NaN", requested: Number.NaN, refundable: 5000, allowFull: true, expect: { ok: false, code: "invalid_amount" } },
  { name: "blank on a full-refund surface = the remainder", requested: null, refundable: 5000, allowFull: true, expect: { ok: true, amountCents: 5000 } },
  { name: "blank where full is not allowed (talent)", requested: null, refundable: 5000, allowFull: false, expect: { ok: false, code: "invalid_amount" } },
  { name: "nothing left to refund", requested: 100, refundable: 0, allowFull: true, expect: { ok: false, code: "nothing_left" } },
  { name: "blank with nothing left", requested: null, refundable: 0, allowFull: true, expect: { ok: false, code: "nothing_left" } },
];

for (const c of amountCases) {
  test(`amount: ${c.name}`, () => {
    const out = checkRefundAmount({
      requestedCents: c.requested,
      refundableCents: c.refundable,
      allowFullRemainder: c.allowFull,
    });
    if (c.expect.ok) {
      assert.deepEqual(out, { ok: true, amountCents: c.expect.amountCents });
    } else {
      assert.equal(out.ok, false);
      if (!out.ok) assert.equal(out.code, c.expect.code);
    }
  });
}

test("the role limit is judged on the AUTHORIZED amount (blank = remainder), not on null", async () => {
  const spy = limitSpy();
  const out = await authorizeRefund({
    capable: true,
    requestedCents: null,
    refundableCents: 4200,
    allowFullRemainder: true,
    enforceLimit: spy.enforceLimit,
  });
  assert.deepEqual(out, { ok: true, amountCents: 4200 });
  assert.deepEqual(spy.calls, [4200]);
});

test("over the role limit: refused with over_limit and the filed request id", async () => {
  const spy = limitSpy({ ok: false, reason: "over_limit", requestId: "req-1" });
  const out = await authorizeRefund({
    capable: true,
    requestedCents: 9000,
    refundableCents: 10000,
    allowFullRemainder: true,
    enforceLimit: spy.enforceLimit,
  });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.code, "over_limit");
  assert.equal(out.requestId, "req-1");
});

test("limit check unavailable: refused as unavailable, nothing moves", async () => {
  const out = await authorizeRefund({
    capable: true,
    requestedCents: 100,
    refundableCents: 1000,
    allowFullRemainder: true,
    enforceLimit: async () => ({ ok: false, reason: "unavailable" }),
  });
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.code, "unavailable");
});

test("an over-remainder ask never reaches the role limit (no approval filed for an impossible refund)", async () => {
  const spy = limitSpy();
  await authorizeRefund({
    capable: true,
    requestedCents: 999999,
    refundableCents: 1000,
    allowFullRemainder: true,
    enforceLimit: spy.enforceLimit,
  });
  assert.equal(spy.calls.length, 0);
});

test("a throwing limit check is a refusal, never a raw throw", async () => {
  const out = await authorizeRefund({
    capable: true,
    requestedCents: 100,
    refundableCents: 1000,
    allowFullRemainder: true,
    enforceLimit: async () => {
      throw new Error("db down");
    },
  });
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.code, "unavailable");
});

test("every refusal has an English and a Spanish sentence, no em dash, no raw code", () => {
  for (const code of REFUND_AUTHORITY_CODES) {
    for (const locale of ["en", "es"] as const) {
      const s = refundAuthorityMessage(code, locale);
      assert.ok(s.length > 10, `${code}/${locale} too short`);
      assert.doesNotMatch(s, /—/);
      assert.notEqual(s, code);
    }
    assert.notEqual(refundAuthorityMessage(code, "en"), refundAuthorityMessage(code, "es"));
  }
  // Any other locale falls back to English rather than printing a key.
  assert.equal(refundAuthorityMessage("over_limit", "fr"), refundAuthorityMessage("over_limit", "en"));
  assert.equal(refundAuthorityMessage("over_limit", "es-MX"), refundAuthorityMessage("over_limit", "es"));
});

// ─── talent: own booking ────────────────────────────────────────────────────

test("talent may refund only a cancelled (work off), direct booking", () => {
  assert.equal(talentMayRefundOwnBooking({ status: "cancelled", sourceType: "direct" }), true);
  assert.equal(talentMayRefundOwnBooking({ status: "expired", sourceType: null }), true);
  assert.equal(talentMayRefundOwnBooking({ status: "confirmed", sourceType: "direct" }), false);
  assert.equal(talentMayRefundOwnBooking({ status: "completed", sourceType: "direct" }), false);
  assert.equal(talentMayRefundOwnBooking({ status: "cancelled", sourceType: "agency" }), false);
  assert.equal(talentMayRefundOwnBooking({ status: "cancelled", sourceType: "AGENCY" }), false);
  assert.equal(talentMayRefundOwnBooking({ status: null, sourceType: "direct" }), false);
});

test("own-booking plan: the requested amount is spread oldest first, each leg capped at its charge's remainder", () => {
  const plan = planOwnBookingRefund(3000, [
    { transactionId: "t1", remainingCents: 2000 },
    { transactionId: "t2", remainingCents: 5000 },
  ]);
  assert.deepEqual(plan, [
    { transactionId: "t1", amountCents: 2000 },
    { transactionId: "t2", amountCents: 1000 },
  ]);
});

test("own-booking plan: never more than asked, charges with nothing left are skipped", () => {
  const plan = planOwnBookingRefund(500, [
    { transactionId: "t0", remainingCents: 0 },
    { transactionId: "t1", remainingCents: 2000 },
    { transactionId: "t2", remainingCents: 5000 },
  ]);
  assert.deepEqual(plan, [{ transactionId: "t1", amountCents: 500 }]);
  const total = plan.reduce((s, l) => s + l.amountCents, 0);
  assert.equal(total, 500);
});
