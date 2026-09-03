import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { OrderForCard } from "@/lib/orders/order-card";
import { loadTenantWords } from "@/lib/words/server";

/**
 * Load the orders a thread's cards refer to.
 *
 * WHY THIS EXISTS RATHER THAN FATTER card_payload. An order card's payload holds
 * `{ order_id }` and nothing else, so every figure it shows is read from the
 * order at render time. That is the whole point: staff add a line, a deposit is
 * paid, a line is refunded — and a card carrying a copy of the total would
 * silently disagree with the order it describes from the next edit onward. The
 * cost of that choice is this function, and it is a cheap one.
 *
 * ONE QUERY FOR THE WHOLE THREAD, not one per card. A thread can hold many
 * orders (deposit, balance, add-ons are separate orders against one
 * conversation), and a per-card fetch would be an N+1 in the hottest read in
 * the product.
 */
export async function loadOrdersForThread(
  db: SupabaseClient,
  orderIds: readonly string[],
  opts: { tenantId?: string | null; locale?: "en" | "es" } = {},
): Promise<Map<string, OrderForCard>> {
  const out = new Map<string, OrderForCard>();
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data: orderRows, error: orderErr } = await db
    .from("orders")
    .select("id, status, currency, total_cents")
    .in("id", ids);

  if (orderErr) {
    // Fail CLOSED and empty. The card renders its neutral "no longer available"
    // state rather than "$0.00", because a wrong figure next to a Pay button is
    // worse than no figure at all.
    logServerError("orders.loadOrdersForThread", orderErr);
    return out;
  }

  const { data: lineRows, error: lineErr } = await db
    .from("order_lines")
    .select("order_id, total_cents")
    .in("order_id", ids);

  if (lineErr) logServerError("orders.loadOrdersForThread/lines", lineErr);

  const lineCount = new Map<string, number>();
  for (const row of (lineRows ?? []) as Array<{ order_id: string }>) {
    lineCount.set(row.order_id, (lineCount.get(row.order_id) ?? 0) + 1);
  }

  // What is still to collect. A deposit taken against a 10000c order leaves
  // 7500c outstanding, and the card must show THAT next to a Pay button rather
  // than the full total — asking a client to pay a sum they have part-paid.
  const { data: paidRows, error: paidErr } = await db
    .from("booking_transactions")
    .select("order_id, gross_amount_cents, status")
    .in("order_id", ids)
    .eq("status", "paid");

  if (paidErr) logServerError("orders.loadOrdersForThread/paid", paidErr);

  const collected = new Map<string, number>();
  for (const row of (paidRows ?? []) as Array<{ order_id: string | null; gross_amount_cents: number }>) {
    if (!row.order_id) continue;
    collected.set(row.order_id, (collected.get(row.order_id) ?? 0) + Number(row.gross_amount_cents ?? 0));
  }

  // ONE words read for the whole thread. D4: the customer-facing noun comes
  // from the tenant's words table with a default, never hardcoded. A failure
  // here yields no noun and the card falls back to "Order" — a neutral word is
  // an acceptable degradation; a blank title is not.
  let noun: string | null = null;
  if (opts.tenantId) {
    try {
      const words = await loadTenantWords(opts.tenantId, opts.locale ?? "en");
      // `word()` returns the KEY itself when the registry has no such row, so a
      // missing row would render "menu.order" on the card. Treat that as no
      // noun and let the neutral fallback take over.
      const resolved = words.word("menu.order");
      noun = resolved && resolved !== "menu.order" ? resolved : null;
    } catch (err) {
      logServerError("orders.loadOrdersForThread/words", err);
    }
  }

  for (const row of (orderRows ?? []) as Array<{
    id: string;
    status: string;
    currency: string;
    total_cents: number;
  }>) {
    const total = Number(row.total_cents ?? 0);
    const already = collected.get(row.id) ?? 0;
    out.set(row.id, {
      id: row.id,
      status: row.status,
      currency: row.currency ?? "USD",
      totalCents: total,
      // Clamped at zero: an over-collection is a refund problem, not a negative
      // amount to show a customer.
      outstandingCents: Math.max(0, total - already),
      lineCount: lineCount.get(row.id) ?? 0,
      noun,
    });
  }

  return out;
}

/** The order ids referenced by a thread's card payloads. */
export function orderIdsFromMessages(
  messages: ReadonlyArray<{ message_kind?: string | null; card_payload?: Record<string, unknown> | null }>,
): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    if (m.message_kind !== "order") continue;
    const id = m.card_payload?.order_id;
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return [...new Set(ids)];
}
