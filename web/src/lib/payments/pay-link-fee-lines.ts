import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadBookingCommissionSnapshots } from "@/lib/billing/commission-engine";
import { bookingClientFeeLines, type FeeLine } from "@/lib/billing/processing-fee-payer";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Client fee breakdown for a /pay link: the engine's frozen snapshot lines of
 * the booking behind the link's order. [] (no breakdown, never a guess) when
 * the order has no booking, no snapshot, a read fails, or the snapshot total
 * is not exactly what this link charges (a deposit, a partial link).
 */
export async function loadPayLinkFeeLines(
  admin: SupabaseClient,
  orderId: string,
  chargeCents: number,
): Promise<FeeLine[]> {
  try {
    const { data, error } = await admin
      .from("agency_bookings")
      .select("id")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logServerError("payments.payLinkFeeLines", error);
      return [];
    }
    const bookingId = (data as { id?: string } | null)?.id;
    if (!bookingId) return [];
    return bookingClientFeeLines(await loadBookingCommissionSnapshots(admin, bookingId), chargeCents);
  } catch (err) {
    logServerError("payments.payLinkFeeLines", err);
    return [];
  }
}
