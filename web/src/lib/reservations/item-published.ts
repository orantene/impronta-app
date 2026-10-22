import "server-only";

/**
 * TUL-1880: the booking widget must respect the reservation item's published
 * status. The purchase pipeline already refuses an unpublished item at the very
 * end, but the guest had been offered times and a Confirm button first. The
 * slots route and the confirm action both ask this before they offer anything.
 * Fails CLOSED ("unknown") on a read error: never offer times we cannot vouch for.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export type ReservationItemPublished = "published" | "unpublished" | "unknown";

export async function reservationItemPublished(
  admin: SupabaseClient,
  tenantId: string,
  offeringId: string | null,
): Promise<ReservationItemPublished> {
  // No item configured is the existing no_offering_configured refusal, not this one.
  if (!offeringId) return "published";
  const { data, error } = await admin
    .from("talent_offerings")
    .select("status")
    .eq("id", offeringId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("reservations.itemPublished", error);
    return "unknown";
  }
  if (!data) return "unpublished";
  return (data as { status?: string | null }).status === "published" ? "published" : "unpublished";
}
