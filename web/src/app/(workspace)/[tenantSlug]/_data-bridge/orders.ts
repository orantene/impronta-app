import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { OrderListRow } from "@/lib/orders/orders-list";

/**
 * _data-bridge/orders.ts — the I/O half of the Orders desk.
 *
 * `lib/orders/orders-list.ts` decides what a staff member SEES; this file only
 * fetches. The split is named in that file's header and exists because the
 * Clients page put its filtering inside the loader, where the only way to test
 * a rule was to render a page.
 */

export type OrdersLoad =
  /**
   * A read error is NOT an empty desk.
   *
   * Returning `[]` on failure would render "No orders yet" to a workspace that
   * has hundreds — the same fail-open shape that the capacity pool lookup was
   * corrected for earlier in this phase, where resolving a transient error to a
   * benign-looking value produced a confident lie. The page must be able to say
   * "we could not load this" instead of inventing an answer.
   */
  | { ok: true; rows: OrderListRow[] }
  | { ok: false };

/**
 * How much money has actually landed on an order.
 *
 * Summed from PAID transactions, deliberately identical to the rule in
 * `lib/orders/complete-order.ts`. If these two ever diverge, the desk shows a
 * balance the completion logic disagrees with, and a staff member chases a
 * customer who already paid. Same source, same predicate, one rule.
 */
const PAID = "paid";

export async function loadWorkspaceOrders(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<OrdersLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);

  const { data: orderRows, error: ordersErr } = await admin
    .from("orders")
    .select(
      "id, status, currency, total_cents, source_channel, created_at, inquiry_id, customer_id",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (ordersErr) {
    logServerError("dataBridge.loadWorkspaceOrders/orders", ordersErr);
    return { ok: false };
  }

  const orders = (orderRows ?? []) as Array<{
    id: string;
    status: string;
    currency: string;
    total_cents: number;
    source_channel: string;
    created_at: string;
    inquiry_id: string | null;
    customer_id: string;
  }>;
  if (orders.length === 0) return { ok: true, rows: [] };

  const orderIds = orders.map((o) => o.id);
  const customerIds = [...new Set(orders.map((o) => o.customer_id))];

  // Three reads rather than one nested select. The joins here cross an RLS
  // boundary and a nested PostgREST select silently returns null for a row the
  // policy hides, which reads on screen as "no customer" rather than as a
  // permission result.
  const [linesRes, txRes, custRes] = await Promise.all([
    admin.from("order_lines").select("order_id").in("order_id", orderIds),
    admin
      .from("booking_transactions")
      .select("order_id, gross_amount_cents")
      .in("order_id", orderIds)
      .eq("status", PAID),
    admin.from("customers").select("id, display_name, email").in("id", customerIds),
  ]);

  if (linesRes.error || txRes.error || custRes.error) {
    logServerError(
      "dataBridge.loadWorkspaceOrders/related",
      linesRes.error ?? txRes.error ?? custRes.error,
    );
    return { ok: false };
  }

  const lineCounts = new Map<string, number>();
  for (const l of (linesRes.data ?? []) as Array<{ order_id: string }>) {
    lineCounts.set(l.order_id, (lineCounts.get(l.order_id) ?? 0) + 1);
  }

  const collected = new Map<string, number>();
  for (const t of (txRes.data ?? []) as Array<{ order_id: string | null; gross_amount_cents: number | null }>) {
    if (!t.order_id) continue;
    collected.set(t.order_id, (collected.get(t.order_id) ?? 0) + Number(t.gross_amount_cents ?? 0));
  }

  const customers = new Map<string, { display_name: string | null; email: string | null }>();
  for (const c of (custRes.data ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) {
    customers.set(c.id, { display_name: c.display_name, email: c.email });
  }

  const rows: OrderListRow[] = orders.map((o) => {
    const cust = customers.get(o.customer_id) ?? null;
    return {
      id: o.id,
      status: o.status,
      currency: o.currency,
      totalCents: Number(o.total_cents ?? 0),
      collectedCents: collected.get(o.id) ?? 0,
      sourceChannel: o.source_channel,
      createdAt: o.created_at,
      customerName: cust?.display_name ?? null,
      customerEmail: cust?.email ?? null,
      lineCount: lineCounts.get(o.id) ?? 0,
      inquiryId: o.inquiry_id,
    };
  });

  return { ok: true, rows };
}
