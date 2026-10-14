import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-706: cancel the bookings of orders nobody can pay any more, so the talent's
 * slot comes back.
 *
 * The calendar's busy read (`load-busy`) counts `talent_bookings` rows that are not
 * cancelled. That mirror row has its OWN id and is linked to the agency booking by
 * `inquiry_id = agency_bookings.source_inquiry_id`, never by the agency booking id.
 * Keying it by the agency id matched nothing, so a failed pay left the slot busy.
 *
 * Money safety: every write is guarded on the booking still being unpaid and
 * confirmed (a racing settle wins), and the talent mirror is only touched for
 * inquiries whose agency booking was selected as unpaid. No amounts, no Stripe.
 */
export async function cancelUnpaidBookings(
  admin: SupabaseClient,
  bookingIds: readonly string[],
): Promise<{ ok: boolean; cancelled: number }> {
  if (bookingIds.length === 0) return { ok: true, cancelled: 0 };
  let ok = true;
  const { data, error: readErr } = await admin
    .from("agency_bookings")
    .select("id, source_inquiry_id")
    .eq("payment_status", "unpaid")
    .eq("status", "confirmed")
    .in("id", [...bookingIds]);
  if (readErr) {
    logServerError("orders.cancelUnpaidBookings/read", readErr);
    return { ok: false, cancelled: 0 };
  }
  const rows = (data ?? []) as Array<{ id: string; source_inquiry_id: string | null }>;
  if (rows.length === 0) return { ok: true, cancelled: 0 };

  const { error: agencyErr } = await admin
    .from("agency_bookings")
    .update({ status: "cancelled" })
    .eq("payment_status", "unpaid")
    .eq("status", "confirmed")
    .in("id", rows.map((r) => r.id));
  if (agencyErr) {
    ok = false;
    logServerError("orders.cancelUnpaidBookings/agency", agencyErr);
  }
  const inquiryIds = rows.map((r) => r.source_inquiry_id).filter((v): v is string => !!v);
  if (inquiryIds.length > 0) {
    const { error: talentErr } = await admin
      .from("talent_bookings")
      .update({ status: "cancelled" })
      .eq("status", "confirmed")
      .in("inquiry_id", inquiryIds);
    if (talentErr) {
      ok = false;
      logServerError("orders.cancelUnpaidBookings/talent", talentErr);
    }
  }
  return { ok, cancelled: rows.length };
}
