/**
 * Tests for the ledger projection.
 *
 * Every case asserts BALANCE explicitly, because an unbalanced group is the one
 * defect that makes the whole ledger worthless — and the database would reject
 * it at commit, which is far too late to be a useful signal.
 *
 * The refusals matter as much as the successes: a projection that quietly
 * writes a plausible-but-wrong group is worse than one that declines.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  projectBookingPayment,
  projectProcessingFee,
  projectRefund,
  projectSubscriptionInvoice,
  projectPayout,
  legsBalance,
  sumByCurrency,
  type CommissionLane,
} from "./project";

const AT = "2026-09-02T12:00:00.000Z";

function lane(over: Partial<CommissionLane> = {}): CommissionLane {
  return {
    participantId: "p1",
    talentProfileId: "tal1",
    owningPartyType: "workspace",
    owningPartyId: "ws1",
    talentNetCents: 10_000,
    workspaceFeeCents: 1_700,
    platformFeeCents: 600,
    grossChargedCents: 12_300,
    ...over,
  };
}

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  assert.equal(r.ok, true, "expected a successful projection");
  return r as Extract<T, { ok: true }>;
}

describe("projectBookingPayment", () => {
  test("splits a payment into cash in, two liabilities and revenue — and balances", () => {
    const r = ok(
      projectBookingPayment({
        transactionId: "txn1",
        bookingId: "bk1",
        tenantId: "ws1",
        currency: "usd",
        grossChargedCents: 12_300,
        lanes: [lane()],
        providerObjectId: "ch_1",
        occurredAt: AT,
      }),
    );
    assert.equal(legsBalance(r.legs), true);
    assert.deepEqual(sumByCurrency(r.legs), { USD: 0 });

    const byAccount = Object.fromEntries(r.legs.map((l) => [l.accountCode, l.amountCents]));
    assert.equal(byAccount.stripe_balance, 12_300, "cash arrived as a debit");
    assert.equal(byAccount.talent_payable, -10_000, "talent is owed, as a liability");
    assert.equal(byAccount.workspace_payable, -1_700);
    assert.equal(byAccount.platform_commission, -600, "only the fee is revenue");
  });

  test("most of a payment is a LIABILITY, not revenue", () => {
    // The audit's core principle: money received is not automatically revenue.
    // Here only 600 of 12,300 is ours.
    const r = ok(
      projectBookingPayment({
        transactionId: "txn1",
        bookingId: "bk1",
        tenantId: "ws1",
        currency: "USD",
        grossChargedCents: 12_300,
        lanes: [lane()],
        providerObjectId: null,
        occurredAt: AT,
      }),
    );
    const revenue = r.legs
      .filter((l) => l.accountCode === "platform_commission")
      .reduce((s, l) => s + -l.amountCents, 0);
    const liabilities = r.legs
      .filter((l) => l.accountCode === "talent_payable" || l.accountCode === "workspace_payable")
      .reduce((s, l) => s + -l.amountCents, 0);
    assert.equal(revenue, 600);
    assert.equal(liabilities, 11_700);
  });

  test("a multi-talent booking credits each talent separately", () => {
    // A single lumped liability cannot be paid out per person.
    const r = ok(
      projectBookingPayment({
        transactionId: "txn1",
        bookingId: "bk1",
        tenantId: "ws1",
        currency: "USD",
        grossChargedCents: 24_600,
        lanes: [
          lane({ participantId: "p1", talentProfileId: "talA" }),
          lane({ participantId: "p2", talentProfileId: "talB" }),
        ],
        providerObjectId: null,
        occurredAt: AT,
      }),
    );
    assert.equal(legsBalance(r.legs), true);
    const talentLegs = r.legs.filter((l) => l.accountCode === "talent_payable");
    assert.equal(talentLegs.length, 2);
    assert.deepEqual(talentLegs.map((l) => l.talentProfileId).sort(), ["talA", "talB"]);
  });

  test("REFUSES to project when the lanes do not sum to what was charged", () => {
    // The commission engine guarantees this invariant. If a snapshot ever
    // violates it, writing a book that does not balance is far worse than
    // declining and surfacing it.
    const r = projectBookingPayment({
      transactionId: "txn1",
      bookingId: "bk1",
      tenantId: "ws1",
      currency: "USD",
      grossChargedCents: 99_999,
      lanes: [lane()],
      providerObjectId: null,
      occurredAt: AT,
    });
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : "", /sum to 12300 but the client was charged 99999/);
  });

  test("REFUSES a payment with no commission lanes", () => {
    // Without a snapshot we cannot say whose money it is; a bare "cash arrived"
    // leg would overstate what the platform holds.
    const r = projectBookingPayment({
      transactionId: "txn1",
      bookingId: null,
      tenantId: null,
      currency: "USD",
      grossChargedCents: 1_000,
      lanes: [],
      providerObjectId: null,
      occurredAt: AT,
    });
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : "", /cannot attribute/i);
  });

  test("a zero-value lane component emits no leg", () => {
    // The schema rejects zero-amount entries, and a zero leg carries no
    // information anyway.
    const r = ok(
      projectBookingPayment({
        transactionId: "txn1",
        bookingId: "bk1",
        tenantId: "ws1",
        currency: "USD",
        grossChargedCents: 10_600,
        lanes: [lane({ workspaceFeeCents: 0, talentNetCents: 10_000, platformFeeCents: 600 })],
        providerObjectId: null,
        occurredAt: AT,
      }),
    );
    assert.equal(r.legs.some((l) => l.accountCode === "workspace_payable"), false);
    assert.equal(legsBalance(r.legs), true);
  });

  test("the group key is deterministic, so a re-run cannot double-count", () => {
    const mk = () =>
      projectBookingPayment({
        transactionId: "txn-stable",
        bookingId: "bk1",
        tenantId: "ws1",
        currency: "USD",
        grossChargedCents: 12_300,
        lanes: [lane()],
        providerObjectId: null,
        occurredAt: AT,
      });
    const a = ok(mk());
    const b = ok(mk());
    assert.equal(a.legs[0].groupKey, b.legs[0].groupKey);
    assert.equal(a.legs[0].groupKey, "booking_payment:txn-stable");
  });

  test("currency is normalised so a group cannot split across usd and USD", () => {
    const r = ok(
      projectBookingPayment({
        transactionId: "txn1",
        bookingId: "bk1",
        tenantId: "ws1",
        currency: "usd",
        grossChargedCents: 12_300,
        lanes: [lane()],
        providerObjectId: null,
        occurredAt: AT,
      }),
    );
    assert.equal(r.legs.every((l) => l.currency === "USD"), true);
  });
});

describe("projectProcessingFee", () => {
  test("books the fee as a cost and takes it out of the balance", () => {
    const r = ok(
      projectProcessingFee({
        balanceTransactionId: "txn_bt1",
        feeCents: 357,
        currency: "USD",
        occurredAt: AT,
      }),
    );
    assert.equal(legsBalance(r.legs), true);
    const byAccount = Object.fromEntries(r.legs.map((l) => [l.accountCode, l.amountCents]));
    assert.equal(byAccount.processing_fees, 357);
    assert.equal(byAccount.stripe_balance, -357);
  });

  test("a zero fee produces no legs rather than an error", () => {
    const r = ok(projectProcessingFee({ balanceTransactionId: "b", feeCents: 0, currency: "USD", occurredAt: AT }));
    assert.deepEqual(r.legs, []);
  });

  test("refuses a negative fee", () => {
    const r = projectProcessingFee({ balanceTransactionId: "b", feeCents: -1, currency: "USD", occurredAt: AT });
    assert.equal(r.ok, false);
  });

  test("is a SEPARATE group from the payment it relates to", () => {
    // Stripe settles the fee as its own balance transaction. Folding it into
    // the payment group would make our stripe_balance disagree with Stripe's.
    const fee = ok(projectProcessingFee({ balanceTransactionId: "bt1", feeCents: 100, currency: "USD", occurredAt: AT }));
    const pay = ok(
      projectBookingPayment({
        transactionId: "txn1",
        bookingId: null,
        tenantId: null,
        currency: "USD",
        grossChargedCents: 12_300,
        lanes: [lane()],
        providerObjectId: null,
        occurredAt: AT,
      }),
    );
    assert.notEqual(fee.legs[0].groupKey, pay.legs[0].groupKey);
  });
});

describe("projectRefund", () => {
  test("books a refund as CONTRA revenue, not negative revenue", () => {
    // Gross revenue and revenue-net-of-refunds are different numbers a finance
    // team needs separately; netting at write time destroys both.
    const r = ok(
      projectRefund({ refundId: "re_1", amountCents: 5_000, currency: "USD", occurredAt: AT }),
    );
    assert.equal(legsBalance(r.legs), true);
    const byAccount = Object.fromEntries(r.legs.map((l) => [l.accountCode, l.amountCents]));
    assert.equal(byAccount.refunds_contra, 5_000);
    assert.equal(byAccount.stripe_balance, -5_000);
    assert.equal(Object.keys(byAccount).includes("platform_commission"), false);
  });

  test("refuses a zero or negative refund", () => {
    assert.equal(projectRefund({ refundId: "r", amountCents: 0, currency: "USD", occurredAt: AT }).ok, false);
    assert.equal(projectRefund({ refundId: "r", amountCents: -5, currency: "USD", occurredAt: AT }).ok, false);
  });
});

describe("projectSubscriptionInvoice", () => {
  test("books the whole amount as revenue when there is no tax", () => {
    const r = ok(
      projectSubscriptionInvoice({
        invoiceId: "in_1",
        amountPaidCents: 7_900,
        taxCents: 0,
        currency: "USD",
        tenantId: "ws1",
        occurredAt: AT,
      }),
    );
    assert.equal(legsBalance(r.legs), true);
    const byAccount = Object.fromEntries(r.legs.map((l) => [l.accountCode, l.amountCents]));
    assert.equal(byAccount.subscription_revenue, -7_900);
    assert.equal("tax_payable" in byAccount, false, "no tax leg when tax is zero");
  });

  test("tax is a LIABILITY from the first cent, never revenue", () => {
    // Booking collected tax as revenue and correcting later is the classic way
    // a platform ends up owing money it has already reported as earnings.
    const r = ok(
      projectSubscriptionInvoice({
        invoiceId: "in_1",
        amountPaidCents: 7_900,
        taxCents: 900,
        currency: "USD",
        tenantId: "ws1",
        occurredAt: AT,
      }),
    );
    assert.equal(legsBalance(r.legs), true);
    const byAccount = Object.fromEntries(r.legs.map((l) => [l.accountCode, l.amountCents]));
    assert.equal(byAccount.subscription_revenue, -7_000);
    assert.equal(byAccount.tax_payable, -900);
  });

  test("refuses tax greater than the amount paid", () => {
    const r = projectSubscriptionInvoice({
      invoiceId: "in_1",
      amountPaidCents: 100,
      taxCents: 200,
      currency: "USD",
      occurredAt: AT,
    });
    assert.equal(r.ok, false);
  });
});

describe("projectPayout", () => {
  test("initiating moves money from the balance into transit", () => {
    const r = ok(projectPayout({ payoutId: "po_1", amountCents: 50_000, currency: "USD", phase: "initiated", occurredAt: AT }));
    assert.equal(legsBalance(r.legs), true);
    const byAccount = Object.fromEntries(r.legs.map((l) => [l.accountCode, l.amountCents]));
    assert.equal(byAccount.stripe_in_transit, 50_000);
    assert.equal(byAccount.stripe_balance, -50_000);
  });

  test("arrival moves it from transit into the bank", () => {
    const r = ok(projectPayout({ payoutId: "po_1", amountCents: 50_000, currency: "USD", phase: "arrived", occurredAt: AT }));
    assert.equal(legsBalance(r.legs), true);
    const byAccount = Object.fromEntries(r.legs.map((l) => [l.accountCode, l.amountCents]));
    assert.equal(byAccount.bank, 50_000);
    assert.equal(byAccount.stripe_in_transit, -50_000);
  });

  test("the two phases are distinct groups, so in-transit money is visible", () => {
    // Without a transit account the gap between the Stripe dashboard and the
    // bank statement cannot be explained.
    const a = ok(projectPayout({ payoutId: "po_1", amountCents: 1, currency: "USD", phase: "initiated", occurredAt: AT }));
    const b = ok(projectPayout({ payoutId: "po_1", amountCents: 1, currency: "USD", phase: "arrived", occurredAt: AT }));
    assert.notEqual(a.legs[0].groupKey, b.legs[0].groupKey);
  });
});

describe("balance helpers", () => {
  test("sumByCurrency keeps currencies apart", () => {
    const legs = [
      { currency: "USD", amountCents: 100 },
      { currency: "MXN", amountCents: -50 },
    ] as never as Parameters<typeof sumByCurrency>[0];
    assert.deepEqual(sumByCurrency(legs), { USD: 100, MXN: -50 });
  });

  test("legsBalance is false when any single currency is off", () => {
    const legs = [
      { currency: "USD", amountCents: 100 },
      { currency: "USD", amountCents: -100 },
      { currency: "MXN", amountCents: -1 },
    ] as never as Parameters<typeof legsBalance>[0];
    assert.equal(legsBalance(legs), false);
  });
});
