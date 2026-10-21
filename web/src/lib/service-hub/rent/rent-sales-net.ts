/**
 * TUL-1702 · The percentage base is what the member's lines actually brought in: each line's value NET of its share of
 * the order-level discount (the same largest-remainder `apportionDiscount` that refund-by-line uses, so the base and a
 * refund always agree), minus what was refunded on that line. Gross minus refunds over-bills a discounted sale.
 * A line's own discount comes off that line first; only what is LEFT of the order discount (orders.discount_cents minus the
 * sum of line discounts, never below zero) is spread over the lines. Pure. An order belongs to the month its FIRST payment landed (paid time), not the month it was created.
 */
import { apportionDiscount } from "@/lib/orders/promo-eligibility";

export type NetOrder = { id: string; discountCents: number };
/** `discountCents` is the line's OWN discount (order_lines.discount_cents), separate from the order-level one. */
export type NetLine = { id: string; orderId: string; talentProfileId: string | null; totalCents: number; refundedCents: number; discountCents?: number };

export function netSalesCents(input: { orders: readonly NetOrder[]; lines: readonly NetLine[]; talentProfileId: string }): number {
  const byOrder = new Map<string, NetLine[]>();
  for (const l of input.lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]);
  let total = 0;
  for (const o of input.orders) {
    const lines = byOrder.get(o.id) ?? [];
    if (!lines.some((l) => l.talentProfileId === input.talentProfileId)) continue;
    // Each line loses its own discount first; the rest of the order discount divides over EVERY line (not only this member's).
    const own = (l: NetLine) => Math.min(Math.max(0, l.discountCents ?? 0), Math.max(0, l.totalCents));
    const afterOwn = lines.map((l) => ({ id: l.id, totalCents: l.totalCents - own(l) }));
    const leftover = Math.max(0, Math.max(0, o.discountCents) - lines.reduce((sum, l) => sum + own(l), 0));
    const shares = new Map(apportionDiscount(afterOwn, {}, leftover).map((x) => [x.id, x.shareCents]));
    for (const l of lines) {
      if (l.talentProfileId !== input.talentProfileId) continue;
      const net = Math.max(0, l.totalCents - own(l) - (shares.get(l.id) ?? 0));
      total += Math.max(0, net - Math.max(0, l.refundedCents));
    }
  }
  return total;
}

/** Orders whose earliest payment falls in [from, to). Input: every paid transaction time of the candidate orders. */
export function ordersPaidInWindow(txns: ReadonlyArray<{ orderId: string; paidAt: string }>, from: string, to: string): string[] {
  const first = new Map<string, number>();
  for (const t of txns) {
    const ms = Date.parse(t.paidAt);
    if (!Number.isFinite(ms)) continue;
    const cur = first.get(t.orderId);
    if (cur == null || ms < cur) first.set(t.orderId, ms);
  }
  const f = Date.parse(from);
  const e = Date.parse(to);
  return [...first.entries()].filter(([, ms]) => ms >= f && ms < e).map(([id]) => id);
}
