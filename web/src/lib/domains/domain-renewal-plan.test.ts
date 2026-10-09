import assert from "node:assert/strict";
import { test } from "node:test";

import {
  effectiveState,
  planRenewal,
  RENEWAL_CHARGE_WINDOW_DAYS,
  RENEWAL_DEADLINE_DAYS,
  type RenewalRow,
} from "./domain-renewal-plan";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const inDays = (d: number) => new Date(NOW + d * 86_400_000 + 3_600_000).toISOString();

const base = (over: Partial<RenewalRow> = {}): RenewalRow => ({
  registrarExpiresAt: inDays(20),
  registrarAutoRenew: true,
  renewalPriceCents: 1_499,
  renewalState: "none",
  renewalCycleExpiresAt: null,
  renewalAttempts: 0,
  renewalLastAttemptAt: null,
  ...over,
});

test("outside the charge window nothing happens; an unknown or past expiry is never acted on", () => {
  assert.deepEqual(planRenewal(base({ registrarExpiresAt: inDays(RENEWAL_CHARGE_WINDOW_DAYS + 2) }), NOW), { kind: "none", reason: "outside_window" });
  assert.deepEqual(planRenewal(base({ registrarExpiresAt: null }), NOW), { kind: "none", reason: "expiry_unknown" });
  assert.deepEqual(planRenewal(base({ registrarExpiresAt: inDays(-3) }), NOW), { kind: "none", reason: "already_expired" });
});

test("inside the window an unbilled cycle is charged at the registrar's renewal price", () => {
  assert.deepEqual(planRenewal(base(), NOW), { kind: "charge", priceCents: 1_499 });
});

test("no known price inside the window needs attention: nothing is billed from a guess", () => {
  assert.deepEqual(planRenewal(base({ renewalPriceCents: null }), NOW), { kind: "needs_attention", reason: "renewal_price_unknown" });
});

test("a paid cycle is done; the same state on a NEW expiry is a fresh cycle", () => {
  const paid = base({ renewalState: "paid", renewalCycleExpiresAt: inDays(20) });
  assert.deepEqual(planRenewal(paid, NOW), { kind: "none", reason: "paid" });
  const renewed = base({ renewalState: "paid", renewalCycleExpiresAt: inDays(20 - 365) });
  assert.equal(effectiveState(renewed), "none");
  assert.equal(planRenewal(renewed, NOW).kind, "charge");
});

test("an unpaid link is reminded on a spaced, capped schedule", () => {
  const awaiting = (attempts: number, lastHoursAgo: number) =>
    base({
      renewalState: "awaiting_payment",
      renewalCycleExpiresAt: inDays(20),
      renewalAttempts: attempts,
      renewalLastAttemptAt: new Date(NOW - lastHoursAgo * 3_600_000).toISOString(),
    });
  assert.deepEqual(planRenewal(awaiting(1, 10), NOW), { kind: "none", reason: "reminded_recently" });
  assert.deepEqual(planRenewal(awaiting(1, 80), NOW), { kind: "remind" });
  assert.deepEqual(planRenewal(awaiting(3, 200), NOW), { kind: "none", reason: "reminders_exhausted" });
});

test("at the deadline an unpaid cycle turns auto-renew OFF, whatever its state, even with no price", () => {
  const near = inDays(RENEWAL_DEADLINE_DAYS - 1);
  assert.deepEqual(planRenewal(base({ registrarExpiresAt: near }), NOW), { kind: "turn_off_autorenew" });
  assert.deepEqual(planRenewal(base({ registrarExpiresAt: near, renewalPriceCents: null }), NOW), { kind: "turn_off_autorenew" });
  const awaiting = base({ registrarExpiresAt: near, renewalState: "awaiting_payment", renewalCycleExpiresAt: near });
  assert.deepEqual(planRenewal(awaiting, NOW), { kind: "turn_off_autorenew" });
  const needs = base({ registrarExpiresAt: near, renewalState: "needs_attention", renewalCycleExpiresAt: near });
  assert.deepEqual(planRenewal(needs, NOW), { kind: "turn_off_autorenew" });
});

test("once auto-renew is off (by us or by someone else) there is nothing to bill or turn off", () => {
  const near = inDays(3);
  const off = base({ registrarExpiresAt: near, renewalState: "unpaid_autorenew_off", renewalCycleExpiresAt: near, registrarAutoRenew: false });
  assert.deepEqual(planRenewal(off, NOW), { kind: "none", reason: "autorenew_off" });
  assert.deepEqual(planRenewal(base({ registrarAutoRenew: false }), NOW), { kind: "none", reason: "autorenew_already_off" });
});

test("a paid cycle at the deadline stays paid (auto-renew is left on)", () => {
  const near = inDays(3);
  assert.deepEqual(planRenewal(base({ registrarExpiresAt: near, renewalState: "paid", renewalCycleExpiresAt: near }), NOW), { kind: "none", reason: "paid" });
});
