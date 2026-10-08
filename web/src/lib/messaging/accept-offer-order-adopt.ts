import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * TUL-429: ONE order per accepted offer. When an offer is accepted, the
 * booking insert trigger already writes an order (`source_channel = 'offer'`,
 * pending_payment, the offer's lines) and attaches it to the booking. The pay
 * path used to look only for its own `messages_offer` order, found none, and
 * created a second; the trigger's order stayed pending for ever and made the
 * Money page read a paid sale as "Pago parcial / Te deben".
 *
 * So before creating one, look for the trigger's order on the same inquiry
 * with the offer's own total and currency (any status but cancelled: a paid or
 * refunded one is still THE order), and adopt it by stamping the pay path's
 * key on it, so the next call finds it by key.
 */
export async function findAdoptableOfferOrder(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string; totalCents: number; currency: string },
): Promise<string | null> {
  const { data, error } = await tenantScopedQuery(admin, "orders", input.tenantId)
    .select("id")
    .eq("inquiry_id", input.inquiryId)
    .eq("source_channel", "offer")
    .eq("currency", input.currency)
    .eq("total_cents", input.totalCents)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("messaging.acceptOffer.adoptOrder.find", error);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

/** Stamp the pay path's key on the adopted order (only while it has none). A failed stamp is logged, never fatal: the order is still the right one. */
export async function stampAdoptedOfferOrder(
  admin: SupabaseClient,
  input: { tenantId: string; orderId: string; orderKey: string },
): Promise<void> {
  const { error } = await tenantScopedQuery(admin, "orders", input.tenantId)
    .update({ source_page: input.orderKey })
    .eq("id", input.orderId)
    .is("source_page", null);
  if (error) logServerError("messaging.acceptOffer.adoptOrder.stamp", error);
}
