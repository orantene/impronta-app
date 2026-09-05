/**
 * What to refund, from which transaction, for a set of order lines.
 *
 * `executeBookingRefund` is keyed on a TRANSACTION and takes an amount. An
 * order can have several paid transactions — a deposit and a balance — so a
 * line whose value spans both cannot be returned by one call. This module
 * turns "refund these lines" into an ordered list of (transaction, amount)
 * instructions the executor can run one at a time.
 *
 * Pure. It decides amounts and never talks to Stripe, so every rule below is
 * testable without money moving.
 */

import { apportionDiscount, type EligibleLine, type PromoScope } from "@/lib/orders/promo-eligibility";

export type RefundableLine = EligibleLine & {
  /** Already returned for this line, cumulative. */
  refundedCents: number;
};

export type PaidTransaction = {
  id: string;
  grossAmountCents: number;
  /** Already refunded against THIS transaction, from its own eligibility. */
  refundedCents: number;
};

export type RefundPlan =
  | {
      ok: true;
      /** Run these in order. Each is one `executeBookingRefund` call. */
      steps: Array<{ transactionId: string; amountCents: number }>;
      /** Per line, what this plan returns. Written to `order_lines.refunded_cents`. */
      lines: Array<{ id: string; amountCents: number }>;
      totalCents: number;
      /** True when every line on the order ends fully refunded. */
      isFullRefund: boolean;
    }
  | { ok: false; reason: RefundPlanRefusal };

export type RefundPlanRefusal =
  | "nothing_to_refund"
  | "line_not_on_order"
  | "line_already_refunded"
  | "exceeds_captured";

/**
 * What a line is worth back, NET of its share of any order-level discount.
 *
 * `orders.discount_cents` is the truth and lines carry no discount column, so a
 * line's share is derived — the same `apportionDiscount` 0.9 uses, which is
 * largest-remainder and therefore sums to exactly the discount. Refunding a
 * discounted line GROSS returns more than the customer paid, which is real
 * money and reconciles wrong quietly.
 */
export function refundableCentsFor(
  line: RefundableLine,
  allLines: readonly RefundableLine[],
  scope: PromoScope,
  discountCents: number,
): number {
  const share = apportionDiscount(allLines, scope, discountCents)
    .find((s) => s.id === line.id)?.shareCents ?? 0;
  const net = Math.max(0, line.totalCents - share);
  return Math.max(0, net - line.refundedCents);
}

export function planRefund(input: {
  lines: readonly RefundableLine[];
  /** The subset being refunded now. */
  lineIds: readonly string[];
  scope: PromoScope;
  discountCents: number;
  /** Paid transactions, oldest first. */
  transactions: readonly PaidTransaction[];
}): RefundPlan {
  const byId = new Map(input.lines.map((l) => [l.id, l]));
  const targets: RefundableLine[] = [];
  for (const id of input.lineIds) {
    const line = byId.get(id);
    if (!line) return { ok: false, reason: "line_not_on_order" };
    targets.push(line);
  }
  if (targets.length === 0) return { ok: false, reason: "nothing_to_refund" };

  const perLine = targets.map((l) => ({
    id: l.id,
    amountCents: refundableCentsFor(l, input.lines, input.scope, input.discountCents),
  }));

  // A line with nothing left REFUSES rather than silently contributing zero.
  // Returning ok with a 0 amount would let a double-refund look successful.
  if (perLine.some((p) => p.amountCents <= 0)) {
    return { ok: false, reason: "line_already_refunded" };
  }

  const totalCents = perLine.reduce((s, p) => s + p.amountCents, 0);

  // ── Gap 2: spread across transactions, oldest first.
  //
  // Oldest-first is deliberate and not arbitrary: the deposit is the charge a
  // customer recognises, and draining it before the balance keeps the refund
  // trail in the order money arrived. It also fails EARLIER — if the total
  // exceeds what was captured, the shortfall shows on the last step rather than
  // after several partial successes.
  const steps: Array<{ transactionId: string; amountCents: number }> = [];
  let left = totalCents;
  for (const txn of input.transactions) {
    if (left <= 0) break;
    const available = Math.max(0, txn.grossAmountCents - txn.refundedCents);
    if (available <= 0) continue;
    const take = Math.min(available, left);
    steps.push({ transactionId: txn.id, amountCents: take });
    left -= take;
  }

  // Refuses rather than refunding what it can. A partial execution would leave
  // money owed with no record of the intent, and the customer would see one
  // refund where two were promised.
  if (left > 0) return { ok: false, reason: "exceeds_captured" };

  const refundedAfter = new Map(perLine.map((p) => [p.id, p.amountCents]));
  const isFullRefund = input.lines.every((l) => {
    const net = Math.max(
      0,
      l.totalCents
        - (apportionDiscount(input.lines, input.scope, input.discountCents)
            .find((s) => s.id === l.id)?.shareCents ?? 0),
    );
    return l.refundedCents + (refundedAfter.get(l.id) ?? 0) >= net;
  });

  return { ok: true, steps, lines: perLine, totalCents, isFullRefund };
}

/**
 * Does this refund release the order's promo redemption?
 *
 * RULING (Director, this phase): a FULL refund releases it; a PARTIAL does not.
 * The redemption is consumed by the act of buying, and only a full refund
 * undoes that act. A one-per-customer code should not be burned on a purchase
 * that was undone, but a partial refund is still a purchase.
 *
 * AND DO NOT RE-EVALUATE ELIGIBILITY AFTER A PARTIAL REFUND. If a code had a
 * minimum spend and a partial refund drops the order below it, the discount is
 * NOT clawed back. Eligibility was decided once, at purchase, against the order
 * as it then stood. Re-deriving it afterwards means a customer who receives a
 * refund we granted can end up owing money — indefensible to them and
 * unexplainable at a counter.
 *
 * The obvious tidy-up later is to recompute. Do not.
 */
export function releasesPromoRedemption(plan: Extract<RefundPlan, { ok: true }>): boolean {
  return plan.isFullRefund;
}
