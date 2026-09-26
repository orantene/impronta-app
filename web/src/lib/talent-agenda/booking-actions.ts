/**
 * Agenda V2 booking lifecycle actions (T1.3, T1.4, G2.1, A0).
 * Idempotent. Typed { ok, reason } results.
 * Every writer requires the signed-in talent to own the booking.
 */

"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { totalClientRevenueToCents } from "@/lib/money/total-client-revenue";
import { logBookingActivity } from "@/lib/server/commercial-audit";
import { BOOKING_AUDIT } from "@/lib/commercial-audit-events";

import { ownBookingGate, talentBookingMirrorEq } from "./ownership";
import type { OwnBookingResult } from "./ownership";

export type AgendaActionOk = { ok: true; already?: boolean };
export type AgendaActionFail = { ok: false; reason: string };
export type AgendaActionResult = AgendaActionOk | AgendaActionFail;

/**
 * Talent must appear on booking_talent or own the talent_bookings mirror id.
 * Exported for cancel / other talent-owned writers in this package.
 */
export async function requireOwnBooking(bookingId: string): Promise<OwnBookingResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "unavailable" };
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authErr ? null : authData?.user ?? null;

  let profile: { id: string } | null = null;
  if (user) {
    const { data, error } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      logServerError("agenda.requireOwnBooking.profile", error);
      return { ok: false, reason: "unavailable" };
    }
    profile = data;
  }

  const talentId = typeof profile?.id === "string" ? profile.id : null;
  if (!user || !talentId) {
    return ownBookingGate({
      bookingId,
      hasSessionUser: Boolean(user),
      userId: user?.id ?? null,
      talentProfileId: talentId,
      onBookingTalent: false,
      ownsTalentBookingMirror: false,
    });
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: leg, error: legErr } = await admin
    .from("booking_talent")
    .select("booking_id")
    .eq("booking_id", bookingId)
    .eq("talent_profile_id", talentId)
    .maybeSingle();
  if (legErr) {
    logServerError("agenda.requireOwnBooking.leg", legErr);
    return { ok: false, reason: "unavailable" };
  }

  let tb: { id: string } | null = null;
  if (!leg) {
    const { data, error: tbErr } = await admin
      .from("talent_bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("talent_profile_id", talentId)
      .maybeSingle();
    if (tbErr) {
      logServerError("agenda.requireOwnBooking.mirror", tbErr);
      return { ok: false, reason: "unavailable" };
    }
    tb = data;
  }

  return ownBookingGate({
    bookingId,
    hasSessionUser: true,
    userId: user.id,
    talentProfileId: talentId,
    onBookingTalent: Boolean(leg),
    ownsTalentBookingMirror: Boolean(tb),
  });
}

/**
 * T1.3 Mark a booking no-show after its start time.
 * Occupies the calendar slot (status stays busy for overlap).
 */
export async function markBookingNoShow(input: {
  bookingId: string;
  now?: Date;
}): Promise<AgendaActionResult> {
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const now = input.now ?? new Date();
  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("id, status, starts_at, customer_id, tenant_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.markBookingNoShow.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "no_show") return { ok: true, already: true };
  if (row.status !== "confirmed") return { ok: false, reason: "not_confirmed" };
  const starts = Date.parse(String(row.starts_at));
  if (Number.isNaN(starts) || starts >= now.getTime()) {
    return { ok: false, reason: "before_start" };
  }

  const { error: upErr } = await admin
    .from("agency_bookings")
    .update({ status: "no_show" })
    .eq("id", input.bookingId)
    .eq("status", "confirmed");
  if (upErr) {
    logServerError("agenda.markBookingNoShow.update", upErr);
    return { ok: false, reason: "unavailable" };
  }

  // Mirror calendar copy by shared id only (never a naked time window).
  const mirror = talentBookingMirrorEq(input.bookingId, own.talentId);
  await admin
    .from("talent_bookings")
    .update({ status: "no_show", updated_at: now.toISOString() })
    .eq("id", mirror.id)
    .eq("talent_profile_id", mirror.talent_profile_id);

  if (row.customer_id) {
    const { data: cust, error: custErr } = await admin
      .from("customers")
      .select("no_shows")
      .eq("id", row.customer_id)
      .maybeSingle();
    if (custErr) {
      logServerError("agenda.markBookingNoShow.customer", custErr);
    } else {
      const next = (Number(cust?.no_shows) || 0) + 1;
      await admin.from("customers").update({ no_shows: next }).eq("id", row.customer_id);
    }
  }

  await logBookingActivity(admin, {
    bookingId: input.bookingId,
    actorUserId: own.userId,
    eventType: BOOKING_AUDIT.STATUS_CHANGED,
    payload: {
      from: row.status,
      to: "no_show",
      surface: "talent_agenda",
    },
  });

  return { ok: true };
}

/**
 * T1.4 Mark booking completed. Does not change payment state.
 * Line adjustments are not supported yet — Finish UI must not offer them.
 */
export async function completeBooking(input: {
  bookingId: string;
}): Promise<AgendaActionResult> {
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("id, status, starts_at")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.completeBooking.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "completed") return { ok: true, already: true };
  if (row.status !== "confirmed" && row.status !== "in_progress") {
    return { ok: false, reason: "not_completable" };
  }

  const { error: upErr } = await admin
    .from("agency_bookings")
    .update({ status: "completed" })
    .eq("id", input.bookingId);
  if (upErr) {
    logServerError("agenda.completeBooking.update", upErr);
    return { ok: false, reason: "unavailable" };
  }

  await admin
    .from("talent_bookings")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", talentBookingMirrorEq(input.bookingId, own.talentId).id)
    .eq("talent_profile_id", own.talentId);

  await logBookingActivity(admin, {
    bookingId: input.bookingId,
    actorUserId: own.userId,
    eventType: BOOKING_AUDIT.STATUS_CHANGED,
    payload: {
      from: row.status,
      to: "completed",
      surface: "talent_agenda",
    },
  });

  return { ok: true };
}

/**
 * T8.2 Talent records cash collected at the appointment (no POS shift).
 * Updates payment_status only — does not invent Stripe money.
 */
export async function recordBookingCashCollected(input: {
  bookingId: string;
  amountCents?: number;
}): Promise<AgendaActionResult> {
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("id, status, payment_status, payment_method, total_client_revenue, deposit_amount_cents")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.recordCash.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (row.payment_status === "paid") return { ok: true, already: true };

  const total = totalClientRevenueToCents(row.total_client_revenue);
  const amount = input.amountCents != null ? Math.max(0, input.amountCents) : total;
  const nextStatus =
    total > 0 && amount > 0 && amount < total
      ? "partial"
      : amount > 0 || total === 0
        ? "paid"
        : "unpaid";

  const { error: upErr } = await admin
    .from("agency_bookings")
    .update({
      payment_status: nextStatus,
      payment_method: "cash",
      payment_notes: "Cash collected by talent at appointment.",
    })
    .eq("id", input.bookingId);
  if (upErr) {
    logServerError("agenda.recordCash.update", upErr);
    return { ok: false, reason: "unavailable" };
  }

  await logBookingActivity(admin, {
    bookingId: input.bookingId,
    actorUserId: own.userId,
    eventType: BOOKING_AUDIT.PAYMENT_STATE_CHANGED,
    payload: {
      surface: "talent_agenda",
      payment_status: { from: row.payment_status, to: nextStatus },
      payment_method: { from: row.payment_method ?? null, to: "cash" },
      amountCents: amount,
    },
  });

  return { ok: true };
}

const TRANSFER_AWAITING_NOTE = "Transfer awaiting confirmation.";

/**
 * T8.2 Mark bank transfer as sent by client, awaiting talent confirmation.
 */
export async function recordBookingTransferAwaiting(input: {
  bookingId: string;
}): Promise<AgendaActionResult> {
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("id, payment_status, payment_method, payment_notes")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.recordTransferAwaiting.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (row.payment_status === "paid") return { ok: true, already: true };
  if (row.payment_method === "transfer" && String(row.payment_notes ?? "").includes("awaiting")) {
    return { ok: true, already: true };
  }

  const { error: upErr } = await admin
    .from("agency_bookings")
    .update({
      payment_method: "transfer",
      payment_notes: TRANSFER_AWAITING_NOTE,
    })
    .eq("id", input.bookingId);
  if (upErr) {
    logServerError("agenda.recordTransferAwaiting.update", upErr);
    return { ok: false, reason: "unavailable" };
  }

  await logBookingActivity(admin, {
    bookingId: input.bookingId,
    actorUserId: own.userId,
    eventType: BOOKING_AUDIT.PAYMENT_STATE_CHANGED,
    payload: {
      surface: "talent_agenda",
      payment_status: { from: row.payment_status, to: row.payment_status },
      payment_method: { from: row.payment_method ?? null, to: "transfer" },
      awaiting: true,
    },
  });

  return { ok: true };
}

/**
 * Confirm a previously awaiting bank transfer was received.
 */
export async function markBookingTransferReceived(input: {
  bookingId: string;
}): Promise<AgendaActionResult> {
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("id, payment_status, payment_method")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.markTransferReceived.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (row.payment_status === "paid") return { ok: true, already: true };
  if (row.payment_method !== "transfer") {
    return { ok: false, reason: "not_transfer" };
  }

  const { error: upErr } = await admin
    .from("agency_bookings")
    .update({
      payment_status: "paid",
      payment_method: "transfer",
      payment_notes: "Transfer confirmed received by talent.",
    })
    .eq("id", input.bookingId);
  if (upErr) {
    logServerError("agenda.markTransferReceived.update", upErr);
    return { ok: false, reason: "unavailable" };
  }

  await logBookingActivity(admin, {
    bookingId: input.bookingId,
    actorUserId: own.userId,
    eventType: BOOKING_AUDIT.PAYMENT_STATE_CHANGED,
    payload: {
      surface: "talent_agenda",
      payment_status: { from: row.payment_status, to: "paid" },
      payment_method: { from: row.payment_method, to: "transfer" },
      transfer_confirmed: true,
    },
  });

  return { ok: true };
}

export type CreateAgendaPayLinkResult =
  | { ok: true; url: string; code: string; already?: boolean }
  | { ok: false; reason: string };

/**
 * When Collect deposit remints against an existing agenda shell whose
 * `total_cents` is below the amount still owed (stale shell after A1 unit
 * fix, or an earlier mint that wrote the major-unit column as cents), bump
 * the unpaid shell so `pos_reserve_collection` no longer returns
 * `exceeds_outstanding` while money is still due.
 *
 * Only grows open talent_agenda shells with no active reservation. Never
 * shrinks, never invents a zero balance.
 */
async function alignAgendaOrderShellToAmount(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  input: {
    orderId: string;
    bookingId: string;
    tenantId: string;
    amountCents: number;
  },
): Promise<{ ok: true } | AgendaActionFail> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, total_cents, subtotal_cents, discount_cents, tax_cents, tip_cents, source_channel, version")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.alignOrderShell.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!order) return { ok: false, reason: "not_found" };
  if (String(order.tenant_id) !== input.tenantId) return { ok: false, reason: "unauthorized" };

  const status = String(order.status ?? "");
  if (status !== "pending_payment" && status !== "draft") {
    return { ok: true };
  }
  if (String(order.source_channel ?? "") !== "talent_agenda") {
    return { ok: true };
  }

  const currentTotal = Math.max(0, Number(order.total_cents) || 0);
  if (currentTotal >= input.amountCents) return { ok: true };

  const { data: reservedRows, error: reservedErr } = await admin
    .from("order_collection_reservations")
    .select("id")
    .eq("order_id", input.orderId)
    .eq("state", "reserved")
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (reservedErr) {
    logServerError("agenda.alignOrderShell.reserved", reservedErr);
    return { ok: false, reason: "unavailable" };
  }
  if (reservedRows && reservedRows.length > 0) {
    // An open hold already claims the current outstanding — do not race it.
    return { ok: true };
  }

  const discount = Math.max(0, Number(order.discount_cents) || 0);
  const tax = Math.max(0, Number(order.tax_cents) || 0);
  const tip = Math.max(0, Number(order.tip_cents) || 0);
  // total = subtotal - discount + tax + tip  (orders_total_is_derived)
  const nextSubtotal = input.amountCents - tax - tip + discount;
  if (nextSubtotal < 0) return { ok: false, reason: "invalid_amount" };

  const { error: upErr } = await admin
    .from("orders")
    .update({
      subtotal_cents: nextSubtotal,
      total_cents: input.amountCents,
      version: (Number(order.version) || 0) + 1,
    })
    .eq("id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .eq("version", order.version);
  if (upErr) {
    logServerError("agenda.alignOrderShell.order", upErr);
    return { ok: false, reason: "unavailable" };
  }

  const { error: lineErr } = await admin
    .from("order_lines")
    .update({
      unit_cents: input.amountCents,
      total_cents: input.amountCents,
    })
    .eq("order_id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .eq("booking_id", input.bookingId);
  if (lineErr) {
    logServerError("agenda.alignOrderShell.line", lineErr);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/**
 * A1.1 — Find or create a minimal pending_payment order for a booking so Card
 * finish can mint a real `/pay/<code>` even when create-slot never set order_id.
 */
async function ensureAgendaOrderShell(
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

/**
 * Mint (or reuse) a payment link for a booking. Creates an order shell when
 * the booking has none (manual slots).
 */
export async function createAgendaBookingPayLink(input: {
  bookingId: string;
  amountCents?: number;
  publicOrigin: string;
}): Promise<CreateAgendaPayLinkResult> {
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await admin
    .from("agency_bookings")
    .select(
      "id, tenant_id, order_id, title, total_client_revenue, currency_code, payment_status, contact_name, contact_email, contact_phone",
    )
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.createPayLink.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.tenant_id) return { ok: false, reason: "no_tenant" };
  if (row.payment_status === "paid") return { ok: false, reason: "already_paid" };

  const total = totalClientRevenueToCents(row.total_client_revenue);
  const amountCents =
    input.amountCents != null && input.amountCents > 0 ? input.amountCents : total;
  if (amountCents <= 0) return { ok: false, reason: "invalid_amount" };

  const shell = await ensureAgendaOrderShell(admin, {
    bookingId: input.bookingId,
    tenantId: String(row.tenant_id),
    talentId: own.talentId,
    title: row.title ?? null,
    amountCents,
    currencyCode: row.currency_code ?? null,
    existingOrderId: row.order_id ? String(row.order_id) : null,
    contactName: row.contact_name ?? null,
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
  });
  if (!shell.ok) return shell;

  // Criterion 4: a new Collect deposit link must kill prior open links so
  // the old /pay/<code> page shows "replaced" and cannot take a second pay.
  const { data: priorOpen, error: priorErr } = await admin
    .from("payment_links")
    .select("id")
    .eq("tenant_id", String(row.tenant_id))
    .eq("order_id", shell.orderId)
    .eq("status", "open");
  if (priorErr) {
    logServerError("agenda.createPayLink.prior", priorErr);
    return { ok: false, reason: "unavailable" };
  }
  if (priorOpen && priorOpen.length > 0) {
    const { cancelPaymentLink } = await import("@/lib/payments/links");
    for (const prior of priorOpen as { id: string }[]) {
      const cancelled = await cancelPaymentLink(admin, {
        tenantId: String(row.tenant_id),
        linkId: prior.id,
        asReplaced: true,
      });
      if (!cancelled.ok && cancelled.reason === "unavailable") {
        return { ok: false, reason: "unavailable" };
      }
    }
  }

  const { resolveAgendaPayPublicOrigin } = await import("./pay-public-origin");
  // Service-role client is wider than the helper's AdminLike; cast at the boundary.
  const publicOrigin = await resolveAgendaPayPublicOrigin(
    admin as Parameters<typeof resolveAgendaPayPublicOrigin>[0],
    String(row.tenant_id),
    input.publicOrigin,
  );

  const { createPaymentLink } = await import("@/lib/payments/links");
  const { agendaFinishCardPayKey, newPaymentRequestAttemptId } = await import(
    "@/lib/payments/payment-request-attempt"
  );
  const minted = await createPaymentLink(admin, {
    tenantId: String(row.tenant_id),
    orderId: shell.orderId,
    amountCents,
    // Unique per mint so remints are not rebound to a cancelled/replaced row.
    idempotencyKey: agendaFinishCardPayKey({
      bookingId: input.bookingId,
      amountCents,
      attemptId: newPaymentRequestAttemptId(),
    }),
    actorUserId: null,
    publicOrigin,
  });
  if (!minted.ok) return { ok: false, reason: minted.reason };
  return { ok: true, url: minted.url, code: minted.code, already: minted.already };
}
