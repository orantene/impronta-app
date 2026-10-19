import { ORDER_MONEY_STATUSES } from "@/lib/orders/order-principal";
import { paymentMethodKey } from "@/lib/payments/activity-shape";
import type { SalesMethod } from "./period";

/**
 * How an order was paid, as the four buckets the Sales filter offers.
 * Built on `paymentMethodKey`, the one place that reads `provider` plus the
 * counter tender (`metadata.paid_via`); this only groups its answers.
 */
export function methodBucket(row: { provider: string; paidVia: string | null }): Exclude<SalesMethod, "any"> {
  const key = paymentMethodKey(row);
  if (key === "cash") return "cash";
  if (key === "card_manual" || key === "stripe_terminal" || key === "mercado_pago_point") return "card";
  if (key === "stripe" || key === "mercado_pago") return "online";
  return "other";
}

export type MethodTxRow = {
  order_id: string | null;
  provider: string | null;
  metadata: unknown;
  status: string | null;
  refund_of_transaction_id: string | null;
};

function paidViaOf(meta: unknown): string | null {
  if (meta && typeof meta === "object") {
    const v = (meta as Record<string, unknown>).paid_via;
    if (typeof v === "string") return v;
  }
  return null;
}

/**
 * The order ids with at least one collected (money-status, non-refund)
 * transaction in `method`; `null` for "any" (no narrowing).
 */
export function ordersMatchingMethod(rows: readonly MethodTxRow[], method: SalesMethod): Set<string> | null {
  if (method === "any") return null;
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.order_id || r.refund_of_transaction_id != null) continue;
    if (!r.status || !ORDER_MONEY_STATUSES.includes(r.status)) continue;
    if (methodBucket({ provider: r.provider ?? "", paidVia: paidViaOf(r.metadata) }) === method) out.add(r.order_id);
  }
  return out;
}
