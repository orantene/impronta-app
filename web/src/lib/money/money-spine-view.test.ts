/**
 * M2 Money spine — view model is driven by M1 fixture + summarizeMoneyLedger.
 * Asserts LEDGER-CONTRACT aggregates (no alternate September totals).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LEDGER_CONTRACT_AGGREGATES } from "./september-ledger-contract";
import {
  buildMoneySpineView,
  buildPaymentDetail,
  buildPayoutDetail,
  buildBreakdownView,
  filterOutstanding,
  outstandingFilterTotal,
  payoutAccountStates,
} from "./money-spine-view";

describe("Money spine view (M2)", () => {
  it("payouts list is newest-first (Part1 p16 mc_payouts)", () => {
    const view = buildMoneySpineView();
    assert.deepEqual(
      view.payouts.map((p) => p.id),
      ["PO-0925", "PO-0918", "PO-0911", "PO-0904"],
    );
    assert.equal(view.payouts[0]?.day, 25);
    assert.equal(view.payouts[0]?.estimated, true);
  });

  it("summary matches LEDGER-CONTRACT aggregates via M1 fixture", () => {
    const view = buildMoneySpineView();
    const s = view.summary;
    const a = LEDGER_CONTRACT_AGGREGATES;
    assert.equal(s.collected_gross, a.collected_gross);
    assert.equal(s.payments_count, a.payments_count);
    assert.equal(s.by_method.card, a.by_method.card);
    assert.equal(s.by_method.cash, a.by_method.cash);
    assert.equal(s.by_method.transfer, a.by_method.transfer);
    assert.equal(s.refunded, a.refunded);
    assert.equal(s.outstanding_total, a.outstanding_total);
    assert.equal(s.outstanding_overdue, a.outstanding_overdue);
    assert.equal(s.outstanding_today, a.outstanding_today);
    assert.equal(s.outstanding_later, a.outstanding_later);
    assert.equal(s.due_by_today, a.due_by_today);
    assert.equal(s.platform_paid_out, a.platform_paid_out);
    assert.equal(s.next_payout_estimated, a.next_payout_estimated);
    assert.equal(s.payouts_count, a.payouts_count);
    assert.equal(s.outstanding_count, a.outstanding_count);
  });

  it("due-by-today filter is overdue + today ($2,620 / 3 rows)", () => {
    const view = buildMoneySpineView();
    const rows = filterOutstanding(view.outstanding, "today");
    assert.equal(rows.length, 3);
    assert.equal(outstandingFilterTotal(view.summary, "today"), 2620);
    assert.equal(
      rows.reduce((n, r) => n + r.left, 0),
      2620,
    );
  });

  it("payment detail for P08 shows partial refund R01", () => {
    const view = buildMoneySpineView();
    const p08 = view.payments.find((p) => p.id === "P08");
    assert.ok(p08);
    const detail = buildPaymentDetail(p08!, view.refunds, view.payouts);
    assert.equal(detail.refund?.id, "R01");
    assert.equal(detail.refund?.amount, 120);
    assert.equal(detail.agreed, 500);
    assert.equal(detail.stateChip, "Received · partly refunded");
    assert.ok(detail.payoutLine?.includes("paid"));
  });

  it("payout detail PO-0918 matches ledger net and included lines (mc_payout)", () => {
    const view = buildMoneySpineView();
    const po = view.payouts.find((p) => p.id === "PO-0918");
    assert.ok(po);
    const detail = buildPayoutDetail(po!, view.payments, view.refunds);
    assert.equal(detail.failed, false);
    assert.equal(detail.netLabel, "$1,928 MXN");
    assert.equal(detail.stateChip, "Paid");
    assert.equal(detail.toBank, "BBVA ···4471");
    assert.equal(detail.arrivedLabel, "Fri 18 Sep");
    assert.equal(detail.reference, "PO-0918");
    assert.equal(detail.showDownloadStatement, true);
    const payments = detail.lines.filter((l) => l.kind === "payment");
    assert.equal(payments.length, 3);
    assert.equal(payments[0]?.label, "Valeria Ruiz · Thu 10 Sep");
    assert.equal(payments[0]?.amountLabel, "$550 MXN");
    assert.equal(payments[1]?.label, "Mónica Ruiz · Sat 12 Sep");
    assert.equal(payments[1]?.amountLabel, "$950 MXN");
    assert.equal(payments[2]?.label, "Daniela Ortiz · Tue 15 Sep");
    assert.equal(payments[2]?.amountLabel, "$620 MXN");
    const refund = detail.lines.find((l) => l.kind === "refund");
    assert.equal(refund?.label, "Refund · Daniela Ortiz");
    assert.equal(refund?.amountLabel, "− $120 MXN");
    const fees = detail.lines.find((l) => l.kind === "fees");
    assert.equal(fees?.amountLabel, "− $72 MXN");
    const total = detail.lines.find((l) => l.kind === "total");
    assert.equal(total?.label, "Payout");
    assert.equal(total?.amountLabel, "$1,928 MXN");
  });

  it("failed alternate for PO-0918 keeps net and names bank return (mc_payout_failed)", () => {
    const view = buildMoneySpineView();
    const po = view.payouts.find((p) => p.id === "PO-0918");
    assert.ok(po);
    const detail = buildPayoutDetail(po!, view.payments, view.refunds, { failed: true });
    assert.equal(detail.failed, true);
    assert.equal(detail.netLabel, "$1,928 MXN");
    assert.equal(detail.stateChip, "Failed · returned by the bank");
    assert.equal(detail.toBank, "BBVA ···0932");
    assert.equal(detail.arrivedLabel, "Did not arrive");
    assert.equal(detail.showDownloadStatement, false);
    assert.ok(detail.alert?.title.includes("Mon 21 Sep"));
    assert.ok(detail.alert?.body.includes("···0932"));
  });

  it("payout account states sheet lists nine visual-spec cards with fixture amounts", () => {
    const states = payoutAccountStates();
    assert.equal(states.length, 9);
    assert.equal(states[0]?.chip, "Not connected");
    assert.equal(states[5]?.chip, "Scheduled · estimated");
    assert.ok(states[5]?.body.includes("$5,784"));
    assert.equal(states[6]?.chip, "Paid");
    assert.ok(states[6]?.body.includes("$1,928"));
    assert.equal(states[7]?.chip, "Failed");
    assert.equal(states[8]?.chip, "Could not load");
    assert.ok(states[8]?.body.includes("hidden rather than shown as zero"));
  });

  it("breakdown view matches LEDGER-CONTRACT reconciliation (mc_breakdown)", () => {
    const bd = buildBreakdownView();
    assert.equal(bd.title, "Breakdown · September");
    assert.equal(bd.processorLines.length, 6);
    assert.equal(bd.processorLines[0]?.amountLabel, "$1,860 MXN");
    assert.equal(bd.processorLines[1]?.amountLabel, "$12,300 MXN");
    assert.equal(bd.processorLines[2]?.amountLabel, "− $120 MXN");
    assert.equal(bd.processorLines[2]?.sub, "Daniela Ortiz, Wed 16 Sep");
    assert.equal(bd.processorLines[3]?.amountLabel, "− $289 MXN");
    assert.equal(bd.processorLines[4]?.amountLabel, "− $7,751 MXN");
    assert.ok(bd.processorLines[4]?.label.includes("BBVA"));
    assert.equal(bd.processorLines[5]?.amountLabel, "$6,000 MXN");
    assert.equal(bd.processorLines[5]?.strong, true);
    assert.ok(bd.processorLines[5]?.sub?.includes("$5,784"));
    assert.ok(bd.processorLines[5]?.sub?.includes("$216"));
    assert.equal(bd.outsideLines[0]?.amountLabel, "$4,150 MXN");
    assert.equal(bd.outsideLines[1]?.amountLabel, "$2,000 MXN");
    assert.equal(bd.collectedLines[0]?.amountLabel, "$18,450 MXN");
    assert.equal(bd.collectedLines[2]?.amountLabel, "$18,330 MXN");
    assert.ok(bd.whyTitle.includes("payout"));
  });
});
