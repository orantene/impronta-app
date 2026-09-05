import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * The executor moves real money, so these pin the properties that decide what
 * happens when a step fails halfway. Static, because the alternative is a fake
 * Supabase deep enough to be its own source of bugs — and the properties here
 * are about CONTROL FLOW and ORDER, which source text can carry honestly.
 *
 * The arithmetic is already covered by `refund-plan.test.ts` against the pure
 * planner, which is where it belongs.
 */
const SRC = blankComments(
  readFileSync(join(process.cwd(), "src/lib/orders/refund-execute-lines.ts"), "utf8"),
);

test("a mid-plan failure after money moved is NOT a plain failure", () => {
  // A Stripe refund cannot be un-refunded. If this returned a generic error
  // after two of three legs landed, a caller would retry and refund those two
  // AGAIN. So the partial outcome is its own result, carrying what moved.
  assert.match(SRC, /partial_failure/, "a partial outcome must be distinguishable");
  assert.match(SRC, /movedCents/, "the result must carry how much actually moved");
  assert.match(SRC, /refundIds/, "and which refunds landed, so a human can reconcile");
});

test("a failure with NOTHING moved is retryable and says so", () => {
  // The distinction is the whole point: one is safe to retry unchanged, the
  // other must never be retried blind.
  assert.match(SRC, /movedCents:\s*0/, "a clean refusal reports zero moved");
});

test("money moves BEFORE per-line state is written", () => {
  // A line marked refunded with no refund behind it hides money owed. A refund
  // with a late mark is visible in Stripe. So the reversible write goes last.
  // Anchored on the UPDATE itself: `from("order_lines")` also appears in the
  // earlier SELECT, so matching the table name would have compared the wrong
  // two positions and passed for the wrong reason.
  const money = SRC.indexOf("await executeBookingRefund");
  const lineState = SRC.indexOf(".update({ refunded_cents");
  assert.ok(money > -1, "the charge step must exist");
  assert.ok(lineState > -1, "the per-line write must exist");
  assert.ok(money < lineState, "the charge must precede the bookkeeping");
});

test("tickets are stamped through refund_admission, never by a bare update", () => {
  // `release_capacity` does not touch admissions and `check_in` admits on
  // status='valid', so a release without a stamp leaves a refunded ticket that
  // still admits. The RPC does both under one row lock; a direct UPDATE here
  // would silently reintroduce the two-call gap.
  assert.match(SRC, /rpc\("refund_admission"/, "must go through the atomic RPC");
  assert.doesNotMatch(
    SRC,
    /from\("admissions"\)[\s\S]{0,120}\.update\(/,
    "must not write admissions.status directly",
  );
});

test("an already-scanned or non-valid admission is skipped, not refunded", () => {
  assert.match(SRC, /admitted_count\s*>\s*0/, "a scanned ticket is a dispute, not a refund");
});

test("the promo redemption is released only when the planner says FULL", () => {
  // Never re-derived here. A partial refund keeps the redemption, and
  // eligibility is never re-evaluated — a customer who receives a refund we
  // granted must not end up owing money.
  assert.match(SRC, /releasesPromoRedemption\(plan\)/, "the ruling lives in one place");
});

test("refunded totals are read the ENGINE's way, not a second way", () => {
  // There is no `refunded_amount_cents` column; a refund is a sibling row on
  // `refund_of_transaction_id` with status 'refunded'. Two definitions would
  // let the plan think a transaction had room that the engine then refuses.
  assert.match(SRC, /refund_of_transaction_id/, "sum the sibling refund rows");
  assert.doesNotMatch(SRC, /refunded_amount_cents/, "that column does not exist");
});
