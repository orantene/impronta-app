/**
 * expire-free-reserves logic — sweep free-reserve bookings whose hold window has
 * lapsed and auto-release them.
 *
 * A "free reserve" (offering `reserve_mode='free'`) confirms a booking WITHOUT a
 * card request — the client holds the slot and the agency collects later. If the
 * offering sets `free_reserve_expires_days`, an unpaid hold older than that many
 * days is released here: the booking is cancelled, its draft transaction voided,
 * any reserved product unit returned to stock, and the human-cancel side effects
 * (audit event + notifications) fire so it looks identical to a manual cancel.
 *
 * There is no durable `reserve_mode` flag on the booking/inquiry, so the sweep
 * reconstructs the free-reserve set by joining each booking's
 * `source_context.offering.offering_id` back to `talent_offerings`. Idempotent:
 * the candidate filter excludes already-cancelled bookings, and the status
 * update is status-guarded, so a row is released at most once.
 *
 * The DB-touching `sweepExpiredFreeReserves` is separated from the pure
 * `isFreeReserveExpired` predicate so the latter is unit-testable without a
 * Supabase client (mirrors builder-rollout-ramp-cron-logic).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActiveBookingTransaction, cancelTransaction } from "@/lib/bookings/transactions";
import { readInquiryOfferingContext } from "@/lib/talent/offering-stock";
import { notifyBookingCancelled } from "@/lib/notifications/producers/booking-cancelled-notify";
import { logServerError } from "@/lib/server/safe-error";

const DAY_MS = 86_400_000;

/** Booking statuses a free reserve can be released from (matches cancelBookingAction). */
export const RELEASABLE_STATES = ["tentative", "confirmed", "draft", "in_progress"] as const;

/**
 * True when a free reserve created at `createdAtIso` has passed its
 * `expiresDays`-day hold as of `nowMs`. Null/non-positive `expiresDays` never
 * expires (the offering opted out of auto-release).
 */
export function isFreeReserveExpired(
  createdAtIso: string | null | undefined,
  expiresDays: number | null | undefined,
  nowMs: number,
): boolean {
  if (!createdAtIso || expiresDays == null || expiresDays <= 0) return false;
  const created = Date.parse(createdAtIso);
  if (!Number.isFinite(created)) return false;
  return nowMs >= created + expiresDays * DAY_MS;
}

type CandidateBooking = {
  id: string;
  created_at: string;
  status: string;
  tenant_id: string | null;
  source_inquiry_id: string | null;
};

export type SweepResult = { scanned: number; cancelled: number; ids: string[] };

export async function sweepExpiredFreeReserves(
  admin: SupabaseClient,
  opts: { now?: Date } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  // The shortest possible hold is 1 day, so anything younger cannot be expired.
  const oldestFreshIso = new Date(nowMs - DAY_MS).toISOString();

  // 1. Candidate bookings: unpaid holds in a live state, at least a day old.
  const { data: candRows, error: candErr } = await admin
    .from("agency_bookings")
    .select("id, created_at, status, tenant_id, source_inquiry_id")
    .eq("payment_status", "unpaid")
    .in("status", RELEASABLE_STATES as unknown as string[])
    .not("source_inquiry_id", "is", null)
    .lt("created_at", oldestFreshIso);
  if (candErr) {
    logServerError("cron/expire-free-reserves/candidates", candErr);
    return { scanned: 0, cancelled: 0, ids: [] };
  }
  const candidates = (candRows ?? []) as CandidateBooking[];
  if (candidates.length === 0) return { scanned: 0, cancelled: 0, ids: [] };

  // 2. Pull each candidate inquiry's offering stamp.
  const inquiryIds = [...new Set(candidates.map((b) => b.source_inquiry_id).filter(Boolean) as string[])];
  const { data: inqRows, error: inqErr } = await admin
    .from("inquiries")
    .select("id, source_context")
    .in("id", inquiryIds);
  if (inqErr) {
    logServerError("cron/expire-free-reserves/inquiries", inqErr);
    return { scanned: candidates.length, cancelled: 0, ids: [] };
  }
  const offeringByInquiry = new Map<string, string>();
  for (const r of inqRows ?? []) {
    const ctx = readInquiryOfferingContext((r as { source_context?: unknown }).source_context);
    if (ctx?.offering_id) offeringByInquiry.set((r as { id: string }).id, ctx.offering_id);
  }

  // 3. Resolve which of those offerings are free-reserve with a finite hold.
  const offeringIds = [...new Set([...offeringByInquiry.values()])];
  if (offeringIds.length === 0) return { scanned: candidates.length, cancelled: 0, ids: [] };
  const { data: offRows, error: offErr } = await (admin as unknown as SupabaseClient)
    .from("talent_offerings")
    .select("id, reserve_mode, free_reserve_expires_days")
    .in("id", offeringIds)
    .eq("reserve_mode", "free")
    .not("free_reserve_expires_days", "is", null);
  if (offErr) {
    logServerError("cron/expire-free-reserves/offerings", offErr);
    return { scanned: candidates.length, cancelled: 0, ids: [] };
  }
  const expiresByOffering = new Map<string, number>();
  for (const r of (offRows ?? []) as { id: string; free_reserve_expires_days: number | null }[]) {
    if (r.free_reserve_expires_days != null) expiresByOffering.set(r.id, r.free_reserve_expires_days);
  }
  if (expiresByOffering.size === 0) return { scanned: candidates.length, cancelled: 0, ids: [] };

  // 4. Release each expired hold.
  const cancelledIds: string[] = [];
  for (const b of candidates) {
    const offId = b.source_inquiry_id ? offeringByInquiry.get(b.source_inquiry_id) : undefined;
    const expiresDays = offId ? expiresByOffering.get(offId) : undefined;
    if (expiresDays == null) continue;
    if (!isFreeReserveExpired(b.created_at, expiresDays, nowMs)) continue;

    // Status-guarded update → releases at most once even under concurrent runs.
    const { data: updated, error: updErr } = await admin
      .from("agency_bookings")
      .update({ status: "cancelled", updated_at: now.toISOString() })
      .eq("id", b.id)
      .in("status", RELEASABLE_STATES as unknown as string[])
      .select("id");
    if (updErr) {
      logServerError("cron/expire-free-reserves/cancel", updErr);
      continue;
    }
    if (!updated || updated.length === 0) continue; // already handled

    const inquiryId = b.source_inquiry_id!;
    try {
      const txn = await loadActiveBookingTransaction(b.id, admin);
      if (txn) await cancelTransaction(txn.id);
      await admin
        .rpc("inquiry_audit_emit", {
          p_inquiry_id: inquiryId,
          p_kind: "booking_cancelled",
          p_payload: { booking_id: b.id, reason: "free_reserve_expired" },
        })
        .then((r) => {
          if (r.error) logServerError("cron/expire-free-reserves/audit", r.error);
        });
      if (b.tenant_id) notifyBookingCancelled({ tenantId: b.tenant_id, inquiryId, bookingId: b.id });
    } catch (err) {
      logServerError("cron/expire-free-reserves/side-effects", err);
    }
    cancelledIds.push(b.id);
  }

  return { scanned: candidates.length, cancelled: cancelledIds.length, ids: cancelledIds };
}
