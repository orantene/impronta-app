/**
 * planMarkRefundedLinkedRow — cumulative partial→remainder booking.
 *
 * Run: npx tsx --test src/lib/bookings/mark-refunded-plan.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { planMarkRefundedLinkedRow } from "./mark-refunded-plan";

describe("planMarkRefundedLinkedRow", () => {
  it("single full refund with no prior partials books the full gross", () => {
    const plan = planMarkRefundedLinkedRow({
      parentGrossCents: 1800,
      existingLinkedRefundGrossCents: [],
      refundAmountCents: 1800,
    });
    assert.deepEqual(plan, {
      alreadyRefundedCents: 0,
      remainingCents: 1800,
      insertAmountCents: 1800,
    });
  });

  it("admin full refund (no slice) with no prior partials books the full gross", () => {
    const plan = planMarkRefundedLinkedRow({
      parentGrossCents: 1800,
      existingLinkedRefundGrossCents: [],
    });
    assert.equal(plan.insertAmountCents, 1800);
  });

  it("partial then remainder books only the remaining cents (Story 3 refuse fix)", () => {
    // Organic prove: $4 partial already booked; $14 remainder must NOT refuse.
    const plan = planMarkRefundedLinkedRow({
      parentGrossCents: 1800,
      existingLinkedRefundGrossCents: [400],
      refundAmountCents: 1400,
    });
    assert.deepEqual(plan, {
      alreadyRefundedCents: 400,
      remainingCents: 1400,
      insertAmountCents: 1400,
    });
  });

  it("partials that already cover the gross → flip-only (no second full row)", () => {
    const plan = planMarkRefundedLinkedRow({
      parentGrossCents: 1800,
      existingLinkedRefundGrossCents: [400, 1400],
      refundAmountCents: 1400,
    });
    assert.deepEqual(plan, {
      alreadyRefundedCents: 1800,
      remainingCents: 0,
      insertAmountCents: 0,
    });
  });

  it("slice larger than remaining is clamped (never over-books)", () => {
    const plan = planMarkRefundedLinkedRow({
      parentGrossCents: 1800,
      existingLinkedRefundGrossCents: [400],
      refundAmountCents: 9999,
    });
    assert.equal(plan.insertAmountCents, 1400);
  });

  it("remainder without an explicit slice still books remaining (legacy payload)", () => {
    const plan = planMarkRefundedLinkedRow({
      parentGrossCents: 1800,
      existingLinkedRefundGrossCents: [400],
    });
    assert.equal(plan.insertAmountCents, 1400);
  });
});
