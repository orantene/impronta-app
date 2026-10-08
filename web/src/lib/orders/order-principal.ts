/**
 * TUL-153: what an order has COLLECTED is its service principal, not the card
 * total. A pass-through Checkout charge stores the principal in
 * `net_amount_cents` and the card surcharge in the gross surplus, so summing
 * gross overstates collection (a MX$1,000 order paid with a client-pays-fee
 * surcharge would show 1,015 paid and a negative balance).
 *
 * This is the TypeScript twin of production SQL `public.order_collected_cents`
 * / `public.order_money_statuses()`. Keep the rules identical:
 *   - count only rows with refund_of_transaction_id null and status in
 *     ORDER_MONEY_STATUSES;
 *   - per row credit net when it is finite with 0 <= net <= gross, else gross.
 *
 * Refund caps (payments/refund-execute.ts) deliberately stay on gross: a refund
 * returns what the card was charged.
 */

export type OrderMoneyRow = {
  gross_amount_cents: number | string | null;
  net_amount_cents?: number | string | null;
};

/** Mirrors SQL `public.order_money_statuses()` (latest migration definition). */
export const ORDER_MONEY_STATUSES: readonly string[] = [
  "paid",
  "payout_pending",
  "payout_sent",
  "payout",
];

export function orderRowPrincipalCents(row: OrderMoneyRow): number {
  const gross = Number(row.gross_amount_cents ?? 0);
  const net = row.net_amount_cents == null ? null : Number(row.net_amount_cents);
  return net != null && Number.isFinite(net) && net >= 0 && net <= gross ? net : gross;
}

export type OrderCollectionRow = OrderMoneyRow & {
  status?: string | null;
  refund_of_transaction_id?: string | null;
};

function countsAsCollected(row: OrderCollectionRow): boolean {
  return (
    row.refund_of_transaction_id == null &&
    typeof row.status === "string" &&
    ORDER_MONEY_STATUSES.includes(row.status)
  );
}

export function sumOrderCollectedCents(rows: readonly OrderCollectionRow[]): number {
  let sum = 0;
  for (const r of rows) if (countsAsCollected(r)) sum += orderRowPrincipalCents(r);
  return sum;
}

export function collectedByOrder(
  rows: readonly (OrderCollectionRow & { order_id: string | null })[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.order_id || !countsAsCollected(r)) continue;
    out.set(r.order_id, (out.get(r.order_id) ?? 0) + orderRowPrincipalCents(r));
  }
  return out;
}
