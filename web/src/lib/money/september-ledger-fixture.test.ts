/**
 * September ledger fixture must reproduce every LEDGER-CONTRACT aggregate
 * (`mc_ledger` / `mc_defs` numbers).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MONEY_DEFINITIONS, moneyDefinition } from "./definitions";
import { summarizeMoneyLedger } from "./money-read-model";
import {
  LEDGER_CONTRACT_AGGREGATES,
  LEDGER_CONTRACT_CLOCK,
  LEDGER_CONTRACT_RECONCILIATION,
} from "./september-ledger-contract";
import {
  SEPTEMBER_LEDGER_OUTSTANDING,
  SEPTEMBER_LEDGER_PAYMENTS,
  SEPTEMBER_LEDGER_PAYOUTS,
  SEPTEMBER_LEDGER_REFUNDS,
  septemberLedgerFixture,
} from "./september-ledger-fixture";

describe("money definitions (mc_defs)", () => {
  it("exports the full mc_defs vocabulary", () => {
    const ids = MONEY_DEFINITIONS.map((d) => d.id);
    assert.deepEqual(ids, [
      "collected",
      "refunded",
      "collected_after_refunds",
      "outstanding",
      "due_by_today",
      "payment_request_waiting",
      "platform_payout",
      "recorded_outside_tulala",
      "agency_money",
      "client_numbers",
      "dates_on_rows",
    ]);
    assert.equal(moneyDefinition("collected").labelEn, "Collected");
    assert.ok(moneyDefinition("outstanding").meaningEn.includes("any month"));
  });
});

describe("September ledger fixture vs LEDGER-CONTRACT", () => {
  const summary = summarizeMoneyLedger(septemberLedgerFixture());
  const c = LEDGER_CONTRACT_AGGREGATES;

  it("uses the contract clock currency and tenant period", () => {
    assert.equal(summary.currency, LEDGER_CONTRACT_CLOCK.currency);
    assert.equal(LEDGER_CONTRACT_CLOCK.tenantFixture, "Jor Beauty");
  });

  it("matches aggregate assertions (collected / refunds / methods)", () => {
    assert.equal(summary.collected_gross, c.collected_gross);
    assert.equal(summary.payments_count, c.payments_count);
    assert.equal(summary.by_method.card, c.by_method.card);
    assert.equal(summary.by_method.cash, c.by_method.cash);
    assert.equal(summary.by_method.transfer, c.by_method.transfer);
    assert.equal(summary.recorded_outside_tulala, c.recorded_outside_tulala);
    assert.equal(summary.refunded, c.refunded);
    assert.equal(summary.collected_after_refunds, c.collected_after_refunds);
  });

  it("matches outstanding splits and due_by_today", () => {
    assert.equal(summary.outstanding_total, c.outstanding_total);
    assert.equal(summary.outstanding_overdue, c.outstanding_overdue);
    assert.equal(summary.outstanding_today, c.outstanding_today);
    assert.equal(summary.outstanding_later, c.outstanding_later);
    assert.equal(summary.due_by_today, c.due_by_today);
    assert.equal(summary.outstanding_count, c.outstanding_count);
  });

  it("matches platform payouts (paid + next estimated)", () => {
    assert.equal(summary.platform_paid_out, c.platform_paid_out);
    assert.equal(summary.next_payout_estimated, c.next_payout_estimated);
    assert.equal(summary.payouts_count, c.payouts_count);
  });

  it("lists exactly 24 payments, 1 refund, 4 payouts, 4 outstanding", () => {
    assert.equal(SEPTEMBER_LEDGER_PAYMENTS.length, 24);
    assert.equal(SEPTEMBER_LEDGER_REFUNDS.length, 1);
    assert.equal(SEPTEMBER_LEDGER_PAYOUTS.length, 4);
    assert.equal(SEPTEMBER_LEDGER_OUTSTANDING.length, 4);
    assert.equal(SEPTEMBER_LEDGER_REFUNDS[0]!.id, "R01");
    assert.equal(SEPTEMBER_LEDGER_REFUNDS[0]!.ofPaymentId, "P08");
  });

  it("keeps Lucía overdue left at $620 (aggregate source of truth)", () => {
    const lucia = SEPTEMBER_LEDGER_OUTSTANDING.find((r) => r.bookingId === "BK-2274");
    assert.ok(lucia);
    assert.equal(lucia!.scope, "overdue");
    assert.equal(lucia!.left, 620);
    assert.equal(lucia!.agreed - lucia!.paid, lucia!.left);
  });

  it("omits Sofía hold and agency AG-118 from outstanding", () => {
    const ids = SEPTEMBER_LEDGER_OUTSTANDING.map((r) => r.bookingId);
    assert.ok(!ids.some((id) => /sofia|AG-118/i.test(id)));
  });

  it("satisfies payout net = gross − refund − fees", () => {
    for (const po of SEPTEMBER_LEDGER_PAYOUTS) {
      assert.equal(po.net, po.gross - po.refund - po.fees, po.id);
    }
  });

  it("satisfies reconciliation identity placeholders (mc_breakdown)", () => {
    const r = LEDGER_CONTRACT_RECONCILIATION;
    const waiting =
      r.waiting_on_1_sep + r.card - r.refund - r.fees_placeholder - r.paid_out;
    assert.equal(waiting, r.waiting_for_fri_25);
    assert.equal(r.card, c.by_method.card);
    assert.equal(r.refund, c.refunded);
    assert.equal(r.paid_out, c.platform_paid_out);
    assert.equal(r.card_payments, 15);
    assert.equal(r.cash_payments, 6);
    assert.equal(r.transfer_payments, 3);
    assert.equal(r.fri_25_fees_estimated, 216);
    assert.equal(c.next_payout_estimated, r.waiting_for_fri_25 - r.fri_25_fees_estimated);
  });
});
