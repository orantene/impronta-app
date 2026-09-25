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
    .update({ payment_status: nextStatus })
    .eq("id", input.bookingId);
  if (upErr) {
    logServerError("agenda.recordCash.update", upErr);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}
