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
  filterOutstanding,
  outstandingFilterTotal,
} from "./money-spine-view";

describe("Money spine view (M2)", () => {
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
});
