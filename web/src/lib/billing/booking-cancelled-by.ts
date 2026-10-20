/**
 * TUL-1366: how a cancelled booking treats the Tulala service fee. Two facts on
 * `agency_bookings`: `cancelled_by` (who) and `service_fee_refundable` (decided
 * at cancel time: seller side cancels, or the client cancels inside the
 * free-cancellation window, returns the fee; a late client cancel keeps it).
 * Null / unreadable keeps the fee (the unchanged behaviour): never guess in
 * anyone's favour.
 */
type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type BookingCancelContext = { cancelledBy: string | null; feeRefundable: boolean | null };

export async function loadBookingCancelContext(admin: Reader, bookingId: string): Promise<BookingCancelContext> {
  const none: BookingCancelContext = { cancelledBy: null, feeRefundable: null };
  try {
    const { data, error } = await admin
      .from("agency_bookings")
      .select("cancelled_by, service_fee_refundable")
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !data) return none;
    const row = data as { cancelled_by?: unknown; service_fee_refundable?: unknown };
    return {
      cancelledBy: typeof row.cancelled_by === "string" && row.cancelled_by ? row.cancelled_by : null,
      feeRefundable: typeof row.service_fee_refundable === "boolean" ? row.service_fee_refundable : null,
    };
  } catch {
    return none;
  }
}

/**
 * The cancel-time decision. Seller side (talent, staff, system) always returns
 * the fee. A client cancel returns it only when it is NOT late, i.e. inside the
 * free-cancellation window (before the cutoff, or no cutoff is enforced).
 */
export function serviceFeeRefundableOnCancel(input: { by: string; lateCancel: boolean }): boolean {
  if (input.by === "client" || input.by === "customer") return !input.lateCancel;
  return input.by === "talent" || input.by === "staff" || input.by === "system";
}
