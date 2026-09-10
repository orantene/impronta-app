import "server-only";

/**
 * The purchase's ONE booking row: whether it exists, and what time it is at.
 *
 * WHY A BOOKING EXISTS HERE AT ALL. `booking_transactions.booking_id` is
 * NOT NULL, so a payment cannot exist without a booking. That is the
 * structural reason both old engines created a booking for a taco, and it is
 * not incidental: making it nullable means reworking
 * `idx_booking_transactions_booking_active` and `booking_payouts_unique_leg`,
 * which are the indexes this track deliberately left alone.
 *
 * WHAT IS DIFFERENT FROM THE ENGINES: the booking is created with NO INQUIRY.
 * `agency_bookings.source_inquiry_id` is nullable, only `tenant_id` is
 * required, so a purchase gets its money anchor without being dragged through
 * the inquiry state machine. The ORDER is the commercial record; the booking
 * is the operations anchor the money spine still requires. When Finance makes
 * `booking_id` nullable, this module is the one place to change.
 *
 * A BOOKING EXISTS FOR TWO REASONS, and the second one is new. Money needs
 * one, which is why the insert only ever ran when something was collected.
 * But a purchase that takes a calendar slot and collects nothing (a free
 * class, a treatment settled in person) produced NO booking at all, so a
 * confirmed appointment existed as a talent hold and a room allocation and was
 * on no operator's board anywhere. The operations anchor is owed to the
 * appointment, not to the payment.
 *
 * THE TIME IS THE BUYER'S, OR NOTHING. The menu engine's `starts_at =
 * ends_at = now()` was a lie about a pizza and stays deleted, and a purchase
 * with no slot still gets no time. But an instant booking arrives carrying
 * the window it just held on a person and a room (`appointmentWindowFor`),
 * and dropping it is how the Appointments board came to say "No time agreed
 * yet" about an appointment twenty minutes away.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import type { AppointmentWindow } from "@/lib/scheduling/appointment-window";

export type PurchaseBookingResult =
  | { ok: true; bookingId: string | null }
  | { ok: false; error: string };

/** Whether this purchase needs a booking at all: money, or a time on a calendar. */
export function purchaseNeedsBooking(input: {
  readonly collectCents: number;
  readonly window: AppointmentWindow | null;
}): boolean {
  return input.collectCents > 0 || input.window !== null;
}

export async function openPurchaseBooking(
  admin: Pick<SupabaseClient, "from">,
  input: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly title: string;
    readonly collectCents: number;
    readonly window: AppointmentWindow | null;
    readonly subtotalCents: number;
    readonly contact: {
      readonly displayName?: string | null;
      readonly email?: string | null;
      readonly phone?: string | null;
    };
  },
): Promise<PurchaseBookingResult> {
  if (!purchaseNeedsBooking(input)) return { ok: true, bookingId: null };

  const { data: bookingRow, error: bookingErr } = await admin
    .from("agency_bookings")
    .insert({
      // `tenant_id` is the ONLY NOT NULL column on agency_bookings, and
      // omitting it is how the first live run failed with "Could not open
      // the payment". The unit test's fake returned an id regardless, so
      // this was invisible until the pipeline met a real database.
      tenant_id: input.tenantId,
      tenant_id_snapshot: input.tenantId,
      // Set BEFORE insert on purpose: `bookings_write_order` fires AFTER
      // INSERT and returns early when `order_id` is already present, so
      // stamping it here is what stops the trigger writing a SECOND order
      // for the order we just made.
      order_id: input.orderId,
      source_inquiry_id: null,
      title: input.title.slice(0, 120) || "Order",
      status: "confirmed",
      starts_at: input.window?.startsAt ?? null,
      ends_at: input.window?.endsAt ?? null,
      contact_name: input.contact.displayName ?? null,
      contact_email: input.contact.email ?? null,
      contact_phone: input.contact.phone ?? null,
      total_client_revenue: input.subtotalCents / 100,
      currency_code: "USD",
    })
    .select("id")
    .single();

  if (bookingErr || !bookingRow) {
    logServerError("orders.createPurchase/booking", bookingErr);
    return {
      ok: false,
      // The sentence names what actually failed. "Could not open the
      // payment" over a booking that collects nothing sends the buyer to
      // check a card that was never going to be charged.
      error: input.collectCents > 0 ? "Could not open the payment." : "Could not open the booking.",
    };
  }
  return { ok: true, bookingId: (bookingRow as { id: string }).id };
}
