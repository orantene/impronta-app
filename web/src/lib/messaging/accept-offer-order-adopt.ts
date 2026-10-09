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
 * refunded one is still THE order), that NO key has claimed yet, and adopt it
 * by stamping the pay path's key on it, so the next call finds it by key.
 * Two offers at the same price on one inquiry therefore get two orders: the
 * first offer's pay path claims its order, which the second can never adopt.
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
    // Never an order another offer's pay path already claimed (it stamped its
    // own key), and the NEWEST unclaimed one: the trigger builds for the latest
    // accepted offer.
    .is("source_page", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("messaging.acceptOffer.adoptOrder.find", error);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Claim the order for this pay path: stamp its key, but only while no key is on
 * it. True only when a row actually changed, so of two concurrent pay paths that
 * found the same unclaimed order exactly one wins; the loser must not use it.
 */
export async function stampAdoptedOfferOrder(
  admin: SupabaseClient,
  input: { tenantId: string; orderId: string; orderKey: string },
): Promise<boolean> {
  const { data, error } = await tenantScopedQuery(admin, "orders", input.tenantId)
    .update({ source_page: input.orderKey })
    .eq("id", input.orderId)
    .is("source_page", null)
    .select("id");
  if (error) {
    logServerError("messaging.acceptOffer.adoptOrder.stamp", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * The pay path's order lookup: its own key first, else adopt the booking
 * trigger's unclaimed order, and use it ONLY when the claim changed a row. A
 * lost claim (a concurrent pay path stamped it) re-reads by key and otherwise
 * returns null, so the caller creates its own order and never shares one.
 */
export async function findOrClaimOfferOrder(steps: {
  byKey: () => Promise<string | null>;
  findAdoptable: () => Promise<string | null>;
  claim: (orderId: string) => Promise<boolean>;
}): Promise<string | null> {
  const keyed = await steps.byKey();
  if (keyed) return keyed;
  const adopted = await steps.findAdoptable();
  if (!adopted) return null;
  if (await steps.claim(adopted)) return adopted;
  return steps.byKey();
}
