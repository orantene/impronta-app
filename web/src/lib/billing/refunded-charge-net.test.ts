/**
 * E5 review fix (2): after a share-only payout reversal (deposit refunded, balance
 * still paid), the talent's Money earnings must read transferred minus reversed,
 * not the full commission snapshot.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { summarizeLedgerPaid, type LedgerPaidRow } from "@/lib/bookings/ledger-paid";
import { shareOfLegCents } from "@/lib/payments/charge-share-math";
import { talentNetAfterRefundedCharges } from "./refunded-charge-net";

const rows = (): LedgerPaidRow[] => [
  { booking_id: "bk", gross_amount_cents: 30000, status: "refunded", provider: "stripe", refund_of_transaction_id: null },
  { booking_id: "bk", gross_amount_cents: 70000, status: "paid", provider: "stripe", refund_of_transaction_id: null },
  // The linked refund row of the deposit: never counted as a refunded CHARGE.
  { booking_id: "bk", gross_amount_cents: 30000, status: "refunded", provider: "stripe", refund_of_transaction_id: "txn_dep" },
];

test("the ledger summary counts the refunded charge once and leaves paid money unchanged", () => {
  const ledger = summarizeLedgerPaid(rows()).get("bk");
  assert.equal(ledger?.paidCents, 70000);
  assert.equal(ledger?.refundedChargeCents, 30000);
});

test("after the deposit's share reversal, earnings equal transferred minus reversed", () => {
  const ledger = summarizeLedgerPaid(rows()).get("bk") ?? null;
  const transferred = 70000;
  const reversed = shareOfLegCents(transferred, 30000, 70000); // what the refund reversed: 21000
  assert.equal(reversed, 21000);
  assert.equal(talentNetAfterRefundedCharges(70000, ledger), transferred - reversed);
  assert.equal(talentNetAfterRefundedCharges(70000, ledger), 49000);
});

test("no refunded charge, no ledger, or nothing left paid: the snapshot net is unchanged", () => {
  const paidOnly = summarizeLedgerPaid([rows()[1]!]).get("bk") ?? null;
  assert.equal(talentNetAfterRefundedCharges(70000, paidOnly), 70000);
  assert.equal(talentNetAfterRefundedCharges(70000, null), 70000);
  // Every charge refunded: the booking is refunded and dropped from Money upstream; never negative here.
  const allRefunded = summarizeLedgerPaid([rows()[0]!]).get("bk") ?? null;
  assert.equal(talentNetAfterRefundedCharges(70000, allRefunded), 70000);
});

test("Money uses it for the talent net, and the loader reads refunded charges", () => {
  const agg = readFileSync(join(process.cwd(), "src/lib/billing/snapshot-aggregations.ts"), "utf8");
  assert.match(agg, /netCents: talentNetAfterRefundedCharges\(snapshot\.talent_net_cents, ledger\)/);
  const loader = readFileSync(join(process.cwd(), "src/lib/bookings/ledger-paid.ts"), "utf8");
  assert.match(loader, /"refunded"/);
  assert.match(loader, /refund_of_transaction_id/);
});
