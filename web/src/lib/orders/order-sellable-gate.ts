/**
 * D1: a charge started on an ALREADY-CREATED order (a ticket order whose card
 * payment is begun in a second request) must pass the same sellability rule that
 * `createPurchase` applied when the order was made. Offerings can be unpublished,
 * hidden or un-approved in between, and the order id comes from the browser.
 *
 * Fails closed: an order with no catalog line, a line whose offering cannot be
 * read, or any unsellable offering is a refusal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { sellability, type SellContext } from "@/lib/offerings/sellable";

export async function orderOfferingsSellable(
  admin: SupabaseClient,
  orderId: string,
  context: SellContext,
): Promise<{ ok: true } | { ok: false; reason: "not_sellable" | "engine_error" }> {
  const { data: lines, error: lineErr } = await admin.from("order_lines").select("offering_id").eq("order_id", orderId);
  if (lineErr) {
    logServerError("orders.orderOfferingsSellable/lines", lineErr);
    return { ok: false, reason: "engine_error" };
  }
  const ids = [
    ...new Set(((lines ?? []) as Array<{ offering_id: string | null }>).map((l) => l.offering_id).filter((id): id is string => Boolean(id))),
  ];
  if (ids.length === 0) return { ok: false, reason: "not_sellable" };

  const { data: rows, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, status, moderation_state, visibility")
    .in("id", ids);
  if (offErr) {
    logServerError("orders.orderOfferingsSellable/offerings", offErr);
    return { ok: false, reason: "engine_error" };
  }
  const byId = new Map(((rows ?? []) as Array<{ id: string; status?: unknown; moderation_state?: unknown; visibility?: unknown }>).map((r) => [r.id, r]));
  for (const id of ids) {
    if (!sellability(byId.get(id), context).ok) return { ok: false, reason: "not_sellable" };
  }
  return { ok: true };
}
