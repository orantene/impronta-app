/**
 * A transfer must DISCHARGE the payable that the payment accrued.
 *
 * The defect this covers: `projectBookingPayment` credits `talent_payable` /
 * `workspace_payable` when the client pays, and before `projectTransfer` there
 * was nothing that ever debited them. The books said we still owed every
 * recipient everything we had ever owed them regardless of what we had paid,
 * and `stripe_balance` was never reduced by the money that left.
 *
 * The test that matters is the ROUND TRIP at the bottom: accrue, then settle,
 * and assert the liability lands on zero. A test that only checked the transfer
 * group balances would pass with the signs inverted, which would double the
 * liability instead of clearing it.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { projectBookingPayment, projectTransfer, legsBalance, sumByCurrency } from "./project";

const AT = "2026-09-05T12:00:00.000Z";

test("a settled talent transfer debits talent_payable and credits stripe_balance", () => {
  const r = projectTransfer({
    transferId: "tr_1", party: "talent", amountCents: 10_000, currency: "usd",
    occurredAt: AT, talentProfileId: "tp_1", tenantId: "tn_1",
  });
  assert.ok(r.ok, "expected a projection");
  if (!r.ok) return;

  const by = Object.fromEntries(r.legs.map((l) => [l.accountCode, l.amountCents]));
  assert.equal(by.talent_payable, 10_000, "the liability must go DOWN (debit is positive here)");
  assert.equal(by.stripe_balance, -10_000, "the cash must leave the balance");
  assert.ok(legsBalance(r.legs), "the group must balance");
  assert.equal(r.legs[0].currency, "USD", "currency is normalised");
});

test("a workspace transfer discharges workspace_payable, not talent_payable", () => {
  const r = projectTransfer({
    transferId: "tr_2", party: "workspace", amountCents: 2_500, currency: "USD", occurredAt: AT,
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const codes = r.legs.map((l) => l.accountCode);
  assert.ok(codes.includes("workspace_payable"));
  assert.ok(!codes.includes("talent_payable"));
  // A workspace leg carries no talent, even if one were passed.
  assert.equal(r.legs.find((l) => l.accountCode === "workspace_payable")!.talentProfileId ?? null, null);
});

test("the group key is deterministic, so a re-run cannot double-discharge", () => {
  const a = projectTransfer({ transferId: "tr_3", party: "talent", amountCents: 100, currency: "USD", occurredAt: AT });
  const b = projectTransfer({ transferId: "tr_3", party: "talent", amountCents: 100, currency: "USD", occurredAt: "2027-01-01T00:00:00.000Z" });
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.equal(a.legs[0].groupKey, b.legs[0].groupKey, "same transfer must map to the same group even on a later run");
});

test("a transfer with no provider id is REFUSED, not projected under a made-up key", () => {
  // Without the transfer id there is no deterministic key, so every run would
  // write another copy of the same movement.
  const r = projectTransfer({ transferId: "", party: "talent", amountCents: 100, currency: "USD", occurredAt: AT });
  assert.equal(r.ok, false);
});

test("a non-positive transfer is REFUSED", () => {
  for (const amt of [0, -1]) {
    const r = projectTransfer({ transferId: "tr_4", party: "talent", amountCents: amt, currency: "USD", occurredAt: AT });
    assert.equal(r.ok, false, `${amt} must be refused`);
  }
});

test("ROUND TRIP: accrue then settle leaves the talent owed exactly nothing", () => {
  // This is the assertion the whole change exists for.
  const paid = projectBookingPayment({
    transactionId: "txn_1",
    bookingId: "bk_1",
    grossChargedCents: 12_000,
    currency: "USD",
    occurredAt: AT,
    tenantId: "tn_1",
    lanes: [
      {
        participantId: "pt_1",
        talentProfileId: "tp_1",
        owningPartyType: "agency",
        owningPartyId: "tn_1",
        talentNetCents: 10_000,
        workspaceFeeCents: 1_500,
        platformFeeCents: 500,
        grossChargedCents: 12_000,
      },
    ],
  });
  assert.ok(paid.ok, "the payment must project");
  if (!paid.ok) return;

  const settled = projectTransfer({
    transferId: "tr_5", party: "talent", amountCents: 10_000, currency: "USD",
    occurredAt: AT, talentProfileId: "tp_1", tenantId: "tn_1",
  });
  assert.ok(settled.ok);
  if (!settled.ok) return;

  const all = [...paid.legs, ...settled.legs];
  const owedToTalent = all
    .filter((l) => l.accountCode === "talent_payable")
    .reduce((s, l) => s + l.amountCents, 0);
  assert.equal(owedToTalent, 0, "after paying the talent, we owe the talent nothing");

  // And the cash actually left: 12,000 in, 10,000 out.
  const balance = all
    .filter((l) => l.accountCode === "stripe_balance")
    .reduce((s, l) => s + l.amountCents, 0);
  assert.equal(balance, 2_000, "the balance keeps only what was not transferred out");

  // Each group still balances on its own — the round trip must not be achieved
  // by two individually-broken groups cancelling each other.
  assert.ok(legsBalance(paid.legs), "payment group balances");
  assert.ok(legsBalance(settled.legs), "transfer group balances");
  assert.deepEqual(sumByCurrency(all), { USD: 0 }, "everything nets to zero, per currency");
});
