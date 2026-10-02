import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import type { AgendaActionFail } from "./booking-actions";

/**
 * A1.1 — Find or create a minimal pending_payment order for a booking so Card
 * finish can mint a real `/pay/<code>` even when create-slot never set order_id.
 */
export async function ensureAgendaOrderShell(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  input: {
    bookingId: string;
    tenantId: string;
    talentId: string;
    title: string | null;
    amountCents: number;
    currencyCode: string | null;
    existingOrderId: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  },
): Promise<{ ok: true; orderId: string } | AgendaActionFail> {
  if (input.existingOrderId) {
    const aligned = await alignAgendaOrderShellToAmount(admin, {
      orderId: String(input.existingOrderId),
      bookingId: input.bookingId,
      tenantId: input.tenantId,
      amountCents: input.amountCents,
    });
    if (!aligned.ok) return aligned;
    return { ok: true, orderId: String(input.existingOrderId) };
  }
  if (input.amountCents <= 0) return { ok: false, reason: "invalid_amount" };

  const currency = (input.currencyCode?.trim() || "MXN").toUpperCase();
  const { generateOpaqueCode } = await import("@/lib/links/code");
  const receiptCode = generateOpaqueCode();

  // orders_draft_has_an_identity + orders_identified_before_payment:
  // pending_payment needs customer_id OR (guest_session_id + receipt_code).
  let customerId: string | null = null;
  const hasContactKey =
    Boolean((input.contactEmail ?? "").trim()) || Boolean((input.contactPhone ?? "").trim());
  if (hasContactKey) {
    const { ensureCustomer } = await import("@/lib/customers/ensure-customer");
    const ensured = await ensureCustomer(
      {
        tenantId: input.tenantId,
        email: input.contactEmail,
        phone: input.contactPhone,
        displayName: input.contactName,
        ownerTalentProfileId: input.talentId,
      },
      { admin },
    );
    if (ensured.ok) customerId = ensured.customerId;
  }
  const guestSessionId = customerId ? null : `agenda:${input.bookingId}`;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      tenant_id: input.tenantId,
      status: "pending_payment",
      currency,
      version: 1,
      subtotal_cents: input.amountCents,
      discount_cents: 0,
      tax_cents: 0,
      total_cents: input.amountCents,
      receipt_code: receiptCode,
      customer_id: customerId,
      guest_session_id: guestSessionId,
      source_channel: "talent_agenda",
      source_page: "finish_collect_card",
      payout_release_rule: "immediate",
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    logServerError("agenda.ensureOrderShell.order", orderErr);
    return { ok: false, reason: "unavailable" };
  }
  const orderId = String((order as { id: string }).id);

  const label = (input.title?.trim() || "Booking").slice(0, 120);
  const { error: lineErr } = await admin.from("order_lines").insert({
    order_id: orderId,
    tenant_id: input.tenantId,
    label,
    units: 1,
    unit_cents: input.amountCents,
    total_cents: input.amountCents,
    talent_profile_id: input.talentId,
    sort_order: 0,
    booking_id: input.bookingId,
    booking_kind: "agency_booking",
  });
  if (lineErr) {
    logServerError("agenda.ensureOrderShell.line", lineErr);
    return { ok: false, reason: "unavailable" };
  }

  const bookingPatch: Record<string, unknown> = { order_id: orderId };
  if (customerId) bookingPatch.customer_id = customerId;
  const { error: linkErr } = await admin
    .from("agency_bookings")
    .update(bookingPatch)
    .eq("id", input.bookingId)
    .is("order_id", null);
  if (linkErr) {
    // Race: another writer may have linked an order — re-read and use that.
    const { data: raced, error: racedErr } = await admin
      .from("agency_bookings")
      .select("order_id")
      .eq("id", input.bookingId)
      .maybeSingle();
    if (!racedErr && raced?.order_id) return { ok: true, orderId: String(raced.order_id) };
    logServerError("agenda.ensureOrderShell.link", linkErr);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, orderId };
}
