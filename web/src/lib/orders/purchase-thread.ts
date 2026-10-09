import "server-only";

/**
 * Open the purchase conversation and link the calendar to it.
 *
 * AFTER the money leg and deliberately BEST-EFFORT: a thread that failed to
 * open is a visibility problem, and cancelling a paid order to fix a
 * visibility problem would be a far worse trade. The order is the record; the
 * thread is where people talk about it.
 *
 * Calendar linkage rides the same best-effort window: the hold already
 * defends public slots; attaching it to the inquiry, stamping
 * `agency_bookings.source_inquiry_id`, and mirroring onto `talent_bookings`
 * is what makes `/c/…` ownership and the talent agenda agree with the
 * confirmed appointment (Path A pay-in-person / free reserve).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { attachReservationHoldToInquiry } from "@/lib/scheduling/reservation-hold";
import { enrichBookingFromReservation, type AppointmentOverride } from "@/lib/scheduling/reservation-convert";
import { clampTaskBrief, type OfferingTaskBrief } from "@/lib/talent/offering-task-brief";
import { normalizeBookingLocale } from "@/lib/scheduling/booking-locale";
import { cleanEventLocation } from "@/lib/scheduling/booking-event-location";
import { formatIntakeBlock } from "@/lib/talent/offering-intake";

export type OpenPurchaseThreadInput = {
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorUserId: string | null;
  /** Cookie-backed guest_sessions.id; stamped even when actorUserId is set. */
  readonly guestSessionId: string | null;
  readonly contact: {
    readonly displayName?: string | null;
    readonly email?: string | null;
    readonly phone?: string | null;
  };
  readonly holdIds: readonly string[];
  readonly bookingId: string | null;
  readonly transactionId: string | null;
  /** Gridline G9b: task-picker brief → `source_context.brief` (clamped). */
  readonly brief?: OfferingTaskBrief | null;
  /** Buyer locale, for the intake answers' heading (G13). */
  readonly locale?: string | null;
  /**
   * The REAL appointment the buyer picked, buffers kept separate. The hold row
   * is buffer-padded (`reserve_resource_set_v2`), so mirroring it as-is moved
   * the appointment by the buffer (TUL-93).
   */
  readonly appointment?: AppointmentOverride | null;
  /** TUL-426: the place the booking sheet sent; becomes `inquiries.event_location`. */
  readonly eventLocation?: string | null;
  /** The booked offering, so the stamp can fall back to its delivery setting. */
  readonly offeringId?: string | null;
};

export async function openPurchaseThread(
  admin: SupabaseClient,
  input: OpenPurchaseThreadInput,
): Promise<string | null> {
  // Re-clamped here: the brief is visitor text from a public form.
  const brief = clampTaskBrief(input.brief);
  const bookingLocale = normalizeBookingLocale(input.locale);
  const eventLocation = cleanEventLocation(input.eventLocation);
  const { data: inqRow, error: inqErr } = await admin
    .from("inquiries")
    .insert({
      tenant_id: input.tenantId,
      source_workspace_id: input.tenantId,
      contact_name: input.contact.displayName ?? input.contact.email ?? "Guest",
      contact_email: input.contact.email ?? "",
      contact_phone: input.contact.phone ?? null,
      client_user_id: input.actorUserId,
      // Always stamp the cookie session when present. `/c/[id]` ownership
      // gates on guest_session_id === cookie; clearing it when the buyer
      // happens to be signed in is how a confirmed instant book 404s.
      guest_session_id: input.guestSessionId,
      // TUL-426: null when unknown, never "".
      ...(eventLocation ? { event_location: eventLocation } : {}),
      // `locale` is the language the buyer was browsing in; the confirmation
      // email renders in it (TUL-93). Read back by `loadInquiryView`.
      ...(brief || bookingLocale
        ? {
            source_context: {
              ...(brief ? { brief } : {}),
              ...(bookingLocale ? { locale: bookingLocale } : {}),
            },
          }
        : {}),
    })
    .select("id")
    .single();

  if (inqErr || !inqRow) {
    logServerError("orders.createPurchase/thread", inqErr);
    return null;
  }

  const inquiryId = (inqRow as { id: string }).id;

  const { error: linkErr } = await admin
    .from("orders")
    .update({ inquiry_id: inquiryId })
    .eq("id", input.orderId);
  if (linkErr) logServerError("orders.createPurchase/thread-link", linkErr);

  // The card carries { order_id } ONLY. Every figure is read from the
  // order at render time, so it cannot drift from what it describes.
  const { error: cardErr } = await admin.from("inquiry_messages").insert({
    inquiry_id: inquiryId,
    tenant_id: input.tenantId,
    thread_type: "private",
    message_kind: "order",
    body: "",
    card_payload: { order_id: input.orderId },
  });
  if (cardErr) logServerError("orders.createPurchase/thread-card", cardErr);

  // G13: the service's intake answers, as a readable buyer message next to the
  // order card (the structured copy is source_context.brief.intake). Same
  // sender columns a guest or client send writes. Best-effort like the card.
  const intakeBlock = formatIntakeBlock(brief?.intake ?? [], input.locale ?? "es");
  if (intakeBlock) {
    const { error: intakeErr } = await admin.from("inquiry_messages").insert({
      inquiry_id: inquiryId,
      tenant_id: input.tenantId,
      thread_type: "private",
      sender_user_id: input.actorUserId,
      guest_session_id: input.actorUserId ? null : input.guestSessionId,
      body: intakeBlock,
      metadata: { intake: true },
    });
    if (intakeErr) logServerError("orders.createPurchase/thread-intake", intakeErr);
  }

  for (const holdId of input.holdIds) {
    const attached = await attachReservationHoldToInquiry(admin, holdId, inquiryId);
    if (!attached.ok) {
      logServerError("orders.createPurchase/hold-attach", attached.error);
    }
  }

  if (input.bookingId) {
    const { error: srcErr } = await admin
      .from("agency_bookings")
      .update({
        source_inquiry_id: inquiryId,
        // TUL-62: keep booking ownership aligned with the inquiry client when
        // the insert path had no actor yet (or a guest later claimed).
        ...(input.actorUserId ? { client_user_id: input.actorUserId } : {}),
      })
      .eq("id", input.bookingId);
    if (srcErr) {
      logServerError("orders.createPurchase/booking-inquiry", srcErr);
    }

    if (input.transactionId) {
      const { error: txnSrcErr } = await admin
        .from("booking_transactions")
        .update({ source_inquiry_id: inquiryId })
        .eq("id", input.transactionId);
      if (txnSrcErr) {
        logServerError("orders.createPurchase/txn-inquiry", txnSrcErr);
      }
    }

    const enriched = await enrichBookingFromReservation(admin, {
      inquiryId,
      bookingId: input.bookingId,
      actorUserId: input.actorUserId,
      appointment: input.appointment ?? null,
      requestedLocation: eventLocation,
      offeringId: input.offeringId ?? null,
      locale: input.locale ?? null,
    });
    if (!enriched.ok) {
      logServerError("orders.createPurchase/talent-mirror", enriched.error);
    }
  }

  return inquiryId;
}
