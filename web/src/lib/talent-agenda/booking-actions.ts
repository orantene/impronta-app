/**
 * Agenda V2 booking lifecycle actions (T1.3, T1.4, G2.1, A0).
 * Idempotent. Typed { ok, reason } results.
 * Every writer requires the signed-in talent to own the booking.
 */

"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type AgendaActionOk = { ok: true; already?: boolean };
export type AgendaActionFail = { ok: false; reason: string };
export type AgendaActionResult = AgendaActionOk | AgendaActionFail;

type OwnOk = { ok: true; talentId: string };

/**
 * Talent must appear on booking_talent or own the talent_bookings mirror id.
 */
async function requireOwnBooking(bookingId: string): Promise<OwnOk | AgendaActionFail> {
  if (!bookingId) return { ok: false, reason: "missing" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "unavailable" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthorized" };

  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (typeof profile?.id !== "string") return { ok: false, reason: "unauthorized" };
  const talentId = profile.id;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: leg } = await admin
    .from("booking_talent")
    .select("booking_id")
    .eq("booking_id", bookingId)
    .eq("talent_profile_id", talentId)
    .maybeSingle();
  if (leg) return { ok: true, talentId };

  const { data: tb } = await admin
    .from("talent_bookings")
    .select("id")
    .eq("id", bookingId)
    .eq("talent_profile_id", talentId)
    .maybeSingle();
  if (tb) return { ok: true, talentId };

  return { ok: false, reason: "unauthorized" };
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
  await admin
    .from("talent_bookings")
    .update({ status: "no_show", updated_at: now.toISOString() })
    .eq("id", input.bookingId)
    .eq("talent_profile_id", own.talentId);

  if (row.customer_id) {
    const { data: cust } = await admin
      .from("customers")
      .select("no_shows")
      .eq("id", row.customer_id)
      .maybeSingle();
    const next = (Number(cust?.no_shows) || 0) + 1;
    await admin.from("customers").update({ no_shows: next }).eq("id", row.customer_id);
  }

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
    .eq("id", input.bookingId)
    .eq("talent_profile_id", own.talentId);

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
    .select("id, status, payment_status, total_client_revenue, deposit_amount_cents")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.recordCash.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (row.payment_status === "paid") return { ok: true, already: true };

  const total = Math.max(0, Number(row.total_client_revenue) || 0);
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
  return { ok: true };
}

export type CreateAgendaPayLinkResult =
  | { ok: true; url: string; code: string; already?: boolean }
  | { ok: false; reason: string };

/**
 * Mint (or reuse) a payment link for a booking that already has an order.
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
    .select("id, tenant_id, order_id, total_client_revenue, payment_status")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.createPayLink.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.order_id || !row.tenant_id) {
    return { ok: false, reason: "no_order" };
  }
  if (row.payment_status === "paid") return { ok: false, reason: "already_paid" };

  const total = Math.max(0, Number(row.total_client_revenue) || 0);
  const amountCents =
    input.amountCents != null && input.amountCents > 0 ? input.amountCents : total;
  if (amountCents <= 0) return { ok: false, reason: "invalid_amount" };

  const { createPaymentLink } = await import("@/lib/payments/links");
  const minted = await createPaymentLink(admin, {
    tenantId: String(row.tenant_id),
    orderId: String(row.order_id),
    amountCents,
    idempotencyKey: `agenda-finish-card-${input.bookingId}-${amountCents}`,
    actorUserId: null,
    publicOrigin: input.publicOrigin.replace(/\/$/, ""),
  });
  if (!minted.ok) return { ok: false, reason: minted.reason };
  return { ok: true, url: minted.url, code: minted.code, already: minted.already };
}
