/**
 * After offer accept creates (or finds) the booking, stamp inquiries.booked_at
 * so engine_convert_to_booking treats the inquiry as already booked and does
 * not insert a second agency_bookings row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export async function stampInquiryBookedAt(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string; at?: string },
): Promise<{ ok: true; stamped: boolean } | { ok: false }> {
  const at = input.at ?? new Date().toISOString();
  const { data, error } = await tenantScopedQuery(admin, "inquiries", input.tenantId)
    .update({ booked_at: at })
    .eq("id", input.inquiryId)
    .is("booked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    logServerError("messaging.acceptOffer.booked_at", error);
    return { ok: false };
  }
  return { ok: true, stamped: Boolean(data) };
}
