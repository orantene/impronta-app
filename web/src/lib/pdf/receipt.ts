import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { PdfDocBuilder, formatMinor, formatDate } from "@/lib/pdf/document";

/**
 * Client booking-receipt PDF.
 *
 * Pulls the booking + its paid transaction and renders a single-page receipt:
 * what / when / where, the gross amount the client paid, and a receipt number.
 * AUTH is the caller's responsibility — pass the authenticated user id; this
 * module verifies the booking belongs to that user before emitting anything.
 */

export type ReceiptResult =
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; reason: "not_found" | "forbidden" | "error" };

type ReceiptBookingRow = {
  id: string;
  title: string | null;
  currency_code: string | null;
  client_user_id: string | null;
  client_account_name: string | null;
  contact_name: string | null;
  event_date: string | null;
  starts_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_location_text: string | null;
  total_client_revenue: number | null;
  tenant_id: string | null;
  created_at: string | null;
};

type ReceiptTxnRow = {
  id: string;
  gross_amount_cents: number | null;
  currency: string | null;
  paid_at: string | null;
  provider_reference: string | null;
  status: string | null;
  created_at: string | null;
};

export async function generateReceiptPdf(
  bookingId: string,
  authUserId: string,
): Promise<ReceiptResult> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "error" };

    const { data: booking, error } = await admin
      .from("agency_bookings")
      .select(
        "id, title, currency_code, client_user_id, client_account_name, contact_name, " +
          "event_date, starts_at, venue_name, venue_address, venue_location_text, " +
          "total_client_revenue, tenant_id, created_at",
      )
      .eq("id", bookingId)
      .returns<ReceiptBookingRow[]>()
      .maybeSingle();

    if (error) {
      logServerError("pdf.receipt.load", error);
      return { ok: false, reason: "error" };
    }
    if (!booking) return { ok: false, reason: "not_found" };

    // AUTH GATE — only the booking's client may pull its receipt.
    if (!booking.client_user_id || booking.client_user_id !== authUserId) {
      return { ok: false, reason: "forbidden" };
    }

    const currency = (booking.currency_code as string) || "USD";

    // The paid transaction carries the true settled gross + paid date + ref.
    const { data: txn } = await admin
      .from("booking_transactions")
      .select("id, gross_amount_cents, currency, paid_at, provider_reference, status, created_at")
      .eq("booking_id", bookingId)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(1)
      .returns<ReceiptTxnRow[]>()
      .maybeSingle();

    // Prefer the settled transaction (already in cents). Fall back to the
    // booking's `total_client_revenue`, which is stored in MAJOR units → ×100.
    const grossCents =
      typeof txn?.gross_amount_cents === "number"
        ? txn.gross_amount_cents
        : Math.max(0, Math.round(Number(booking.total_client_revenue ?? 0) * 100));
    const txnCurrency = (txn?.currency as string) || currency;
    const paidAt = (txn?.paid_at as string | null) ?? null;
    const receiptNo = receiptNumber(bookingId, (txn?.id as string | null) ?? null);

    const brand = await loadBrand(admin, booking.tenant_id as string | null);

    const where =
      (booking.venue_name as string | null) ||
      (booking.venue_address as string | null) ||
      (booking.venue_location_text as string | null) ||
      "—";
    const who =
      (booking.client_account_name as string | null) ||
      (booking.contact_name as string | null) ||
      "—";

    const builder = await PdfDocBuilder.create();
    builder
      .meta(`Receipt ${receiptNo}`, "Booking payment receipt")
      .header(brand, "Payment receipt")
      .row("Receipt no.", receiptNo)
      .row("Issued", formatDate(paidAt ?? (booking.created_at as string)))
      .divider()
      .section("Booking")
      .row("Event", (booking.title as string) || "Booking")
      .row("Date", formatDate((booking.event_date as string | null) ?? (booking.starts_at as string | null)))
      .row("Location", where)
      .row("Billed to", who)
      .divider()
      .section("Payment")
      .row("Status", paidAt ? "Paid" : "Recorded")
      .row("Amount paid", formatMinor(grossCents, txnCurrency), { strong: true })
      .footer(
        "This receipt confirms the gross amount paid for the booking above. " +
          "Keep it for your records. Issued by Tulala on behalf of " +
          `${brand}.`,
      );

    const bytes = await builder.toBytes();
    return { ok: true, bytes, filename: `receipt-${receiptNo}.pdf` };
  } catch (err) {
    logServerError("pdf.receipt.generate", err);
    return { ok: false, reason: "error" };
  }
}

function receiptNumber(bookingId: string, txnId: string | null): string {
  const src = (txnId || bookingId).replace(/-/g, "");
  return `R-${src.slice(0, 8).toUpperCase()}`;
}

async function loadBrand(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string | null,
): Promise<string> {
  if (!tenantId) return "Tulala";
  try {
    const { data } = await admin
      .from("agencies")
      .select("display_name")
      .eq("id", tenantId)
      .maybeSingle();
    return (data?.display_name as string | null) || "Tulala";
  } catch {
    return "Tulala";
  }
}
