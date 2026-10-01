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
import { enrichBookingFromReservation } from "@/lib/scheduling/reservation-convert";
import { clampTaskBrief, type OfferingTaskBrief } from "@/lib/talent/offering-task-brief";

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
};

export async function openPurchaseThread(
  admin: SupabaseClient,
  input: OpenPurchaseThreadInput,
): Promise<string | null> {
  // Re-clamped here: the brief is visitor text from a public form.
  const brief = clampTaskBrief(input.brief);
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
      ...(brief ? { source_context: { brief } } : {}),
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

  for (const holdId of input.holdIds) {
    const attached = await attachReservationHoldToInquiry(admin, holdId, inquiryId);
    if (!attached.ok) {
      logServerError("orders.createPurchase/hold-attach", attached.error);
    }
  }

  if (input.bookingId) {
    const { error: srcErr } = await admin
      .from("agency_bookings")
      .update({ source_inquiry_id: inquiryId })
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
    });
    if (!enriched.ok) {
      logServerError("orders.createPurchase/talent-mirror", enriched.error);
    }
  }

  return inquiryId;
}
