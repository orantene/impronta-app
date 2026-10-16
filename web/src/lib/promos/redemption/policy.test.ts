import test from "node:test";
import assert from "node:assert/strict";

import {
  decideCancellation,
  decideRefund,
  holdExpiresAt,
  holdIsLive,
  isBlockedFromLimitedPromos,
  isLimitedPromo,
  leakGuardThreshold,
  normalizeEmail,
  normalizePhone,
  packageCreditRefundCents,
  personalCode,
  reissueEndsAt,
  requoteReschedule,
  resolveIdentity,
  shouldTripLeakGuard,
  GENERIC_CODE_ERROR,
} from "./policy";

const NOW = new Date("2026-10-14T12:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

// ── Holds ──
test("instant hold is 10 minutes, request-to-book is 24 hours", () => {
  assert.equal(holdExpiresAt("instant", NOW).getTime() - NOW.getTime(), 10 * 60_000);
  assert.equal(holdExpiresAt("request_to_book", NOW).getTime() - NOW.getTime(), 24 * 3_600_000);
});

test("an expired hold is not live; confirmed always is", () => {
  assert.equal(holdIsLive({ status: "held", hold_expires_at: inHours(-0.01).toISOString() }, NOW), false);
  assert.equal(holdIsLive({ status: "held", hold_expires_at: inHours(0.1).toISOString() }, NOW), true);
  assert.equal(holdIsLive({ status: "confirmed", hold_expires_at: null }, NOW), true);
  assert.equal(holdIsLive({ status: "released", hold_expires_at: null }, NOW), false);
});

// ── B3 rows ──
test("B3: client cancels inside the free window -> seat returns, refund what was paid", () => {
  assert.deepEqual(decideCancellation({ kind: "client_cancel", startsAt: inHours(30), now: NOW, freeCancelHours: 24 }), {
    action: "release",
    refund: "paid_amount",
  });
});

test("B3: client cancels late -> seat consumed, refund per policy", () => {
  assert.deepEqual(decideCancellation({ kind: "client_cancel", startsAt: inHours(5), now: NOW, freeCancelHours: 24 }), {
    action: "consume",
    refund: "per_policy",
  });
});

test("B3: no-show -> consumed and marked", () => {
  assert.deepEqual(decideCancellation({ kind: "no_show" }), { action: "no_show", refund: "per_policy" });
});

test("B3: talent cancels -> seat returns, personal re-issue, full refund", () => {
  assert.deepEqual(decideCancellation({ kind: "talent_cancel" }), { action: "release_and_reissue", refund: "full" });
  assert.equal(reissueEndsAt(NOW).getTime() - NOW.getTime(), 14 * 24 * 3_600_000);
});

test("L1: Libera tu lugar at >= 4h is a release, not a no-show; under 4h is consumed", () => {
  assert.equal(decideCancellation({ kind: "client_release_spot", startsAt: inHours(4), now: NOW }).action, "release");
  assert.equal(decideCancellation({ kind: "client_release_spot", startsAt: inHours(3.9), now: NOW }).action, "consume");
});

test("B3: partial refund keeps the use, full refund voids it", () => {
  assert.equal(decideRefund("partial"), "keep_use");
  assert.equal(decideRefund("full"), "void");
});

test("B3: package credits refund at the paid per-credit price, floored", () => {
  assert.equal(packageCreditRefundCents(100_000, 3, 1), 33_333);
  assert.equal(packageCreditRefundCents(90_000, 10, 4), 36_000);
  assert.equal(packageCreditRefundCents(90_000, 10, 99), 90_000);
  assert.equal(packageCreditRefundCents(90_000, 0, 1), 0);
});

type Slot = { day: "tue" | "fri" };
const quoteTueOnly = async (s: Slot) =>
  s.day === "tue" ? { totalCents: 36_000, promoApplied: true } : { totalCents: 45_000, promoApplied: false };

test("B3: reschedule to a still-eligible date keeps the discount", async () => {
  const r = await requoteReschedule({ paidTotalCents: 36_000, newSlot: { day: "tue" }, quote: quoteTueOnly });
  assert.deepEqual(r, { eligible: true, newTotalCents: 36_000, deltaCents: 0, waived: false });
});

test("B3: reschedule to an ineligible date shows the difference", async () => {
  const r = await requoteReschedule({ paidTotalCents: 36_000, newSlot: { day: "fri" }, quote: quoteTueOnly });
  assert.deepEqual(r, { eligible: false, newTotalCents: 45_000, deltaCents: 9_000, waived: false });
});

test("B3: talent override keeps the discount on an ineligible date", async () => {
  const r = await requoteReschedule({
    paidTotalCents: 36_000,
    newSlot: { day: "fri" },
    quote: quoteTueOnly,
    talentKeepsDiscount: true,
  });
  assert.deepEqual(r, { eligible: false, newTotalCents: 36_000, deltaCents: 0, waived: true });
});

// ── No-shows ──
test("L1: the 2nd no-show blocks limited promos, the 1st does not", () => {
  assert.equal(isBlockedFromLimitedPromos(0), false);
  assert.equal(isBlockedFromLimitedPromos(1), false);
  assert.equal(isBlockedFromLimitedPromos(2), true);
  assert.equal(isLimitedPromo({ max_redemptions: 3 }), true);
  assert.equal(isLimitedPromo({ max_redemptions: null }), false);
});

// ── Identity ──
test("phone normalizes to E.164 (MX default), email lowercases", () => {
  assert.equal(normalizePhone("998 123 4567"), "+529981234567");
  assert.equal(normalizePhone("+52 (998) 123-4567"), "+529981234567");
  assert.equal(normalizePhone("0052 998 123 4567"), "+529981234567");
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizeEmail("  Ana@Mail.COM "), "ana@mail.com");
  assert.equal(normalizeEmail("nope"), null);
});

test("identity: phone OR email resolves to one customer, phone wins a conflict", () => {
  assert.deepEqual(resolveIdentity({ byPhone: [{ id: "a" }], byEmail: [] }), {
    kind: "matched",
    customerId: "a",
    by: "phone",
    conflict: false,
  });
  assert.deepEqual(resolveIdentity({ byPhone: [], byEmail: [{ id: "b" }] }), {
    kind: "matched",
    customerId: "b",
    by: "email",
    conflict: false,
  });
  assert.deepEqual(resolveIdentity({ byPhone: [{ id: "a" }], byEmail: [{ id: "b" }] }), {
    kind: "matched",
    customerId: "a",
    by: "phone",
    conflict: true,
  });
  assert.deepEqual(resolveIdentity({ byPhone: [], byEmail: [] }), { kind: "none" });
});

// ── Leak guard ──
test("leak guard: threshold is max(5, 3x daily rate) and trips only above it", () => {
  assert.equal(leakGuardThreshold(0), 5);
  assert.equal(leakGuardThreshold(1), 5);
  assert.equal(leakGuardThreshold(4), 12);
  assert.equal(shouldTripLeakGuard({ newClientAttemptsLastHour: 5, normalDailyNewClientRate: 0 }), false);
  assert.equal(shouldTripLeakGuard({ newClientAttemptsLastHour: 6, normalDailyNewClientRate: 0 }), true);
  assert.equal(shouldTripLeakGuard({ newClientAttemptsLastHour: 12, normalDailyNewClientRate: 4 }), false);
  assert.equal(shouldTripLeakGuard({ newClientAttemptsLastHour: 13, normalDailyNewClientRate: 4 }), true);
  assert.equal(shouldTripLeakGuard({ newClientAttemptsLastHour: 6, normalDailyNewClientRate: Number.NaN }), true);
});

// ── Codes ──
test("personal code: name prefix, 4 unambiguous chars, accents stripped", () => {
  assert.equal(personalCode("Ána", () => 0), "ANA-2222");
  assert.equal(personalCode(null, () => 0), "TU-2222");
  assert.match(personalCode("María José", (n) => n - 1), /^MARIAJ-[2-9A-HJKMNP-Z]{4}$/);
});

test("generic code error has no em dash and says nothing specific", () => {
  assert.equal(GENERIC_CODE_ERROR.includes("—"), false);
});
