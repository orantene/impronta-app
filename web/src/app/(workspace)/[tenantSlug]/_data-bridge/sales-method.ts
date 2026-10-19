import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ORDER_MONEY_STATUSES } from "@/lib/orders/order-principal";
import { ordersMatchingMethod, type MethodTxRow } from "@/lib/sales/payment-method";
import type { SalesMethod } from "@/lib/sales/period";
import { logServerError } from "@/lib/server/safe-error";

const SLICE = 100;
const PAGE = 1000;

/**
 * Read every row a query yields, a page at a time (PostgREST caps one answer
 * at 1000 rows and a silent cap would under-count a busy workspace). The
 * first error stops the read and is returned, never swallowed.
 */
export async function readAllPages<T>(
  // Row type is the caller's claim about the select list (the client is untyped here).
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const data: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await page(from, from + PAGE - 1);
    if (res.error) return { data, error: res.error };
    const got = (res.data ?? []) as T[];
    data.push(...got);
    if (got.length < PAGE) return { data, error: null };
  }
}

/**
 * The order ids (out of `orderIds`, which the caller already scoped to one
 * tenant) paid with `method`. `null` means no narrowing ("any"); `undefined`
 * means the read failed and the caller must report the load as failed.
 */
export async function orderIdsPaidWith(
  admin: SupabaseClient,
  orderIds: readonly string[],
  method: SalesMethod,
): Promise<Set<string> | null | undefined> {
  if (method === "any") return null;
  const rows: MethodTxRow[] = [];
  for (let i = 0; i < orderIds.length; i += SLICE) {
    const slice = orderIds.slice(i, i + SLICE);
    const { data, error } = await readAllPages<MethodTxRow>((from, to) =>
      admin
        .from("booking_transactions")
        .select("order_id, provider, metadata, status, refund_of_transaction_id")
        .in("order_id", slice)
        .in("status", [...ORDER_MONEY_STATUSES])
        .order("id")
        .range(from, to),
    );
    if (error) {
      logServerError("dataBridge.salesMethod/transactions", error);
      return undefined;
    }
    rows.push(...data);
  }
  return ordersMatchingMethod(rows, method);
}
