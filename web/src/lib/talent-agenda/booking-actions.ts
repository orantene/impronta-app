/**
 * Agenda V2 booking lifecycle actions (T1.3, T1.4).
 * Idempotent. Typed { ok, reason } results.
 */

"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type AgendaActionOk = { ok: true; already?: boolean };
export type AgendaActionFail = { ok: false; reason: string };
export type AgendaActionResult = AgendaActionOk | AgendaActionFail;

/**
 * T1.3 Mark a booking no-show after its start time.
 * Occupies the calendar slot (status stays busy for overlap).
 */
export async function markBookingNoShow(input: {
  bookingId: string;
  now?: Date;
}): Promise<AgendaActionResult> {
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

  // Mirror onto talent calendar copy when present (inquiry-linked or title match later).
  await admin
    .from("talent_bookings")
    .update({ status: "no_show", updated_at: now.toISOString() })
    .eq("status", "confirmed")
    .gte("starts_at", new Date(starts - 60_000).toISOString())
    .lte("starts_at", new Date(starts + 60_000).toISOString());

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
 */
export async function completeBooking(input: {
  bookingId: string;
  adjustLines?: { label: string; cents: number }[];
}): Promise<AgendaActionResult> {
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

  void input.adjustLines; // line adjustments land with Finish-and-collect (T8.2)

  const { error: upErr } = await admin
    .from("agency_bookings")
    .update({ status: "completed" })
    .eq("id", input.bookingId);
  if (upErr) {
    logServerError("agenda.completeBooking.update", upErr);
    return { ok: false, reason: "unavailable" };
  }

  const starts = Date.parse(String(row.starts_at));
  if (!Number.isNaN(starts)) {
    await admin
      .from("talent_bookings")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .in("status", ["confirmed"])
      .gte("starts_at", new Date(starts - 60_000).toISOString())
      .lte("starts_at", new Date(starts + 60_000).toISOString());
  }

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
 * Leaves payment_status unpaid/partial so money is not invented; derive maps
 * payment_method=transfer to awaiting (not overdue after complete).
 */
export async function recordBookingTransferAwaiting(input: {
  bookingId: string;
}): Promise<AgendaActionResult> {
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
 * Does not invent money — webhook /pay confirms.
 */
export async function createAgendaBookingPayLink(input: {
  bookingId: string;
  amountCents?: number;
  publicOrigin: string;
}): Promise<CreateAgendaPayLinkResult> {
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
