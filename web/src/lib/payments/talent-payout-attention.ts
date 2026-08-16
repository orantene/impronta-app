import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { payoutLegPayeeScope } from "@/lib/payments/booking-payouts-ledger";
import { logServerError } from "@/lib/server/safe-error";
import {
  EMPTY_TALENT_PAYOUT_ATTENTION,
  payoutLegCurrency,
  payoutReversalCause,
  summarizePayoutAttention,
  type PayoutAttentionState,
  type TalentPayoutAttention,
  type TalentPayoutAttentionLeg,
} from "@/lib/payments/talent-payout-attention-types";

/**
 * Every payout leg of one talent that did NOT reach their bank — reversed,
 * failed, or still held — with enough booking context to recognise it.
 *
 * Uses the SAME payee predicate as `getHeldPayoutTotals` / `releaseHeldPayouts`
 * (`payoutLegPayeeScope`), so the talent's view can never disagree with what
 * the release path acts on. Service-role read, scoped to the caller's own
 * `talentProfileId`; best-effort — an empty payload on any failure, because
 * this hangs off a dashboard layout that must never break.
 */

/** Ledger statuses that mean "money did not land". */
const ATTENTION_STATUSES = ["held", "failed", "reversed"];

/** Most recent legs only — this is a talent-facing summary, not an audit export. */
const MAX_LEGS = 50;

type LegRow = {
  id: string;
  booking_id: string;
  amount_cents: number;
  currency: string | null;
  status: string;
  last_error: string | null;
  created_at: string;
  updated_at: string | null;
};

type BookingRow = { id: string; title: string | null; event_date: string | null };

export async function loadTalentPayoutAttention(
  talentProfileId: string,
  sbIn?: SupabaseClient | null,
): Promise<TalentPayoutAttention> {
  const sb = sbIn ?? createServiceRoleClient();
  if (!sb || !talentProfileId) return EMPTY_TALENT_PAYOUT_ATTENTION;
  try {
    const scope = payoutLegPayeeScope({ talentProfileId });
    if (!scope) return EMPTY_TALENT_PAYOUT_ATTENTION;

    let query = sb
      .from("booking_payouts")
      .select("id, booking_id, amount_cents, currency, status, last_error, created_at, updated_at")
      .in("status", ATTENTION_STATUSES);
    for (const [col, val] of scope.eq) query = query.eq(col, val);
    for (const [col, vals] of scope.in) query = query.in(col, vals);

    const { data, error } = await query.order("created_at", { ascending: false }).limit(MAX_LEGS);
    if (error) {
      logServerError("talent-payout-attention.legs", error);
      return EMPTY_TALENT_PAYOUT_ATTENTION;
    }
    const rows = (data ?? []) as LegRow[];
    if (rows.length === 0) return EMPTY_TALENT_PAYOUT_ATTENTION;

    // Booking context in one follow-up read (no PostgREST embed: booking_payouts
    // carries no FK-named relationship the embed syntax could resolve here).
    const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))];
    const bookingById = new Map<string, BookingRow>();
    if (bookingIds.length > 0) {
      const { data: bookings, error: bookingErr } = await sb
        .from("agency_bookings")
        .select("id, title, event_date")
        .in("id", bookingIds);
      if (bookingErr) logServerError("talent-payout-attention.bookings", bookingErr);
      for (const b of (bookings ?? []) as BookingRow[]) bookingById.set(b.id, b);
    }

    const legs: TalentPayoutAttentionLeg[] = rows.map((row) => {
      const booking = bookingById.get(row.booking_id);
      return {
        id: row.id,
        bookingId: row.booking_id,
        state: row.status as PayoutAttentionState,
        amountCents: row.amount_cents ?? 0,
        currency: payoutLegCurrency(row.currency),
        bookingTitle: booking?.title ?? null,
        eventDate: booking?.event_date ?? null,
        atIso: row.updated_at ?? row.created_at,
        cause: row.status === "reversed" ? payoutReversalCause(row.last_error) : "unknown",
      };
    });

    return { legs, totals: summarizePayoutAttention(legs) };
  } catch (err) {
    logServerError("talent-payout-attention.load", err);
    return EMPTY_TALENT_PAYOUT_ATTENTION;
  }
}
