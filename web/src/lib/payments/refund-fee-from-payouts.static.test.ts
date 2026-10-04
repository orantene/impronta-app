/**
 * A4 guard: seller-pays refund eligibility MUST merge `booking_payouts.processing_fee_cents`
 * via loadBookingCommissionSnapshotsForRefund. A bare snapshot load has no actual fee
 * column and would block every seller-pays refund (or guess).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src/lib/payments");

test("refund-execute loads fees via ForRefund (not bare snapshots)", () => {
  const src = readFileSync(join(ROOT, "refund-execute.ts"), "utf8");
  assert.match(src, /loadBookingCommissionSnapshotsForRefund/);
  assert.equal(
    /loadBookingCommissionSnapshots\b(?!ForRefund)/.test(src),
    false,
    "refund-execute must not call bare loadBookingCommissionSnapshots for fees",
  );
});

test("handleBookingRefund feesKept path uses ForRefund", () => {
  const src = readFileSync(join(ROOT, "refunds.ts"), "utf8");
  assert.match(src, /loadBookingCommissionSnapshotsForRefund/);
  assert.match(
    src,
    /nonRefundableFeeCents\(\s*await\s+loadBookingCommissionSnapshotsForRefund/,
  );
});
