/**
 * TUL-1366: who cancelled a booking (`agency_bookings.cancelled_by`), for the
 * refund rule on the Tulala service fee: returned when the seller side cancels,
 * kept when the client cancels. Null when unknown or unreadable, which keeps the
 * fee (the unchanged, non-refundable behaviour): never guess in the client's or
 * the seller's favour.
 */
type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadBookingCancelledBy(admin: Reader, bookingId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from("agency_bookings").select("cancelled_by").eq("id", bookingId).maybeSingle();
    if (error) return null;
    const v = (data as { cancelled_by?: unknown } | null)?.cancelled_by;
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}
