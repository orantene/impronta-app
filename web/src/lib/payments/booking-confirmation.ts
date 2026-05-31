/**
 * Booking-confirmation fan-out (P2) — runs on Stripe payment success.
 *
 * Called from the `booking_payment` webhook action AFTER `markPaid`. Produces
 * the post-payment artifact the client expects:
 *   • a booking-confirmation PDF auto-attached to the inquiry's Files tab.
 * The in-thread chat card is already posted by `markPaid` (payment_paid), the
 * Details tab reflects the paid status, and the confirmation/receipt emails are
 * owned by the notification engine (`payment.received` from `markPaid`,
 * `booking.created` at conversion) — so this module owns the PDF only.
 *
 * Everything is best-effort and idempotent: the payment has already settled,
 * so a failure here is logged, never thrown, and a re-delivered webhook does
 * not double-attach or double-email (guarded on the existing attachment).
 *
 * Service-role: storage upload to `inquiry-files` and the `inquiry_attachments`
 * insert both require elevated access in a webhook (no end-user session).
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  generateBookingConfirmationPdf,
  type BookingConfirmationLineItem,
} from "./booking-confirmation-pdf";

const CONFIRMATION_FILENAME = "Booking confirmation.pdf";

type TalentRef = { display_name: string | null } | { display_name: string | null }[] | null;

interface OfferLineRow {
  label: string | null;
  units: number | string | null;
  unit_price: number | string | null;
  total_price: number | string | null;
  talent_profiles: TalentRef;
}

function talentName(ref: TalentRef): string | null {
  const tp = Array.isArray(ref) ? ref[0] : ref;
  return tp?.display_name ?? null;
}

function toCents(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

/**
 * Generate + attach the booking-confirmation PDF for a paid booking
 * transaction. Idempotent + best-effort. (Confirmation/receipt emails are
 * dispatched by the notification engine, not here.)
 */
export async function emitBookingConfirmation(transactionId: string): Promise<void> {
  const sb = createServiceRoleClient();
  if (!sb) {
    logServerError("booking-confirmation", new Error("service-role client unavailable"));
    return;
  }

  try {
    // 1. Resolve the transaction → booking / inquiry / tenant + the amount paid.
    const { data: txn } = await sb
      .from("booking_transactions")
      .select("id, booking_id, source_inquiry_id, source_tenant_id, gross_amount_cents, currency, paid_at, created_by_profile_id")
      .eq("id", transactionId)
      .maybeSingle();
    if (!txn?.booking_id || !txn.source_inquiry_id || !txn.source_tenant_id) return;

    const bookingId = txn.booking_id as string;
    const inquiryId = txn.source_inquiry_id as string;
    const tenantId = txn.source_tenant_id as string;

    // 2. Idempotency — bail if a confirmation PDF is already attached.
    const { data: existing } = await sb
      .from("inquiry_attachments")
      .select("id")
      .eq("inquiry_id", inquiryId)
      .eq("filename", CONFIRMATION_FILENAME)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    // 3. Booking + accepted offer + agency name.
    const { data: booking } = await sb
      .from("agency_bookings")
      .select("contact_name, client_user_id, total_client_revenue, currency_code")
      .eq("id", bookingId)
      .maybeSingle();

    const { data: offer } = await sb
      .from("inquiry_offers")
      .select(`id, total_client_price, currency_code,
        inquiry_offer_line_items (
          label, units, unit_price, total_price, sort_order,
          talent_profiles!talent_profile_id ( display_name )
        )`)
      .eq("inquiry_id", inquiryId)
      .eq("status", "accepted")
      .order("accepted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: agency } = await sb
      .from("agencies")
      .select("display_name")
      .eq("id", tenantId)
      .maybeSingle();

    // 4. Compose the PDF input. The client-facing receipt shows subtotal +
    //    service fee (the client surcharge) + total; never internal splits.
    const currency =
      (txn.currency as string | null) ||
      (booking?.currency_code as string | null) ||
      (offer?.currency_code as string | null) ||
      "USD";
    const totalPaidCents = (txn.gross_amount_cents as number | null) ?? 0;
    const subtotalCents =
      booking?.total_client_revenue != null
        ? toCents(booking.total_client_revenue as number | string)
        : offer?.total_client_price != null
          ? toCents(offer.total_client_price as number | string)
          : totalPaidCents;
    const serviceFeeCents = Math.max(0, totalPaidCents - subtotalCents);

    const rawLines = (offer?.inquiry_offer_line_items ?? []) as OfferLineRow[];
    const lineItems: BookingConfirmationLineItem[] = rawLines.map((ln) => ({
      label: ln.label ?? "Service",
      talentName: talentName(ln.talent_profiles),
      units: Number(ln.units) || 1,
      unitPriceCents: toCents(ln.unit_price),
      totalPriceCents: toCents(ln.total_price),
    }));

    const pdfBytes = await generateBookingConfirmationPdf({
      confirmationNumber: `TUL-${bookingId.slice(0, 8).toUpperCase()}`,
      paidAtISO: (txn.paid_at as string | null) ?? new Date().toISOString(),
      clientName: (booking?.contact_name as string | null) ?? "Client",
      workspaceName: (agency?.display_name as string | null) ?? "Tulala",
      currency,
      lineItems: lineItems.length
        ? lineItems
        : [{ label: "Booking", units: 1, unitPriceCents: subtotalCents, totalPriceCents: subtotalCents }],
      subtotalCents,
      serviceFeeCents,
      totalPaidCents,
    });

    // 5. Upload to the inquiry-files bucket + register the attachment so it
    //    appears in the Files tab. uploaded_by must be a real profiles.id.
    const uploadedBy =
      (booking?.client_user_id as string | null) ??
      (txn.created_by_profile_id as string | null) ??
      null;
    const storagePath = `${tenantId}/${inquiryId}/${crypto.randomUUID()}-booking-confirmation.pdf`;

    const { error: upErr } = await sb.storage
      .from("inquiry-files")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (upErr) {
      logServerError("booking-confirmation.upload", upErr);
    } else if (uploadedBy) {
      const { error: insErr } = await sb.from("inquiry_attachments").insert({
        tenant_id: tenantId,
        inquiry_id: inquiryId,
        uploaded_by: uploadedBy,
        storage_path: storagePath,
        filename: CONFIRMATION_FILENAME,
        mime_type: "application/pdf",
        byte_size: pdfBytes.byteLength,
        attachment_kind: "contract",
        visibility: "shared",
        description: "Auto-generated payment confirmation",
      });
      if (insErr) logServerError("booking-confirmation.attach", insErr);
    } else {
      logServerError(
        "booking-confirmation.attach",
        new Error(`no uploaded_by for booking ${bookingId} — PDF uploaded, attachment row skipped`),
      );
    }

    // NB: the post-payment confirmation email is no longer sent from here. The
    // notification engine owns it now — `payment.received` (client receipt +
    // workspace alert) fires from `markPaid`, and `booking.created` emails the
    // client + roster talent at conversion time. This module is solely
    // responsible for the booking-confirmation PDF + its Files-tab attachment.
  } catch (err) {
    logServerError(`booking-confirmation[txn=${transactionId}]`, err);
  }
}
