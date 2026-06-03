import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotification } from "@/lib/notifications/emit";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import { logServerError } from "@/lib/server/safe-error";

/** The minimal shape of a reverseBookingPayouts() outcome we read here. */
type ReversalOutcome = {
  participantId: string;
  party: string;
  amountCents: number;
  result: string;
};

/**
 * Notify the affected talent(s) + the client when a booking's payouts are
 * reversed by a lost dispute or a refund (audit #14 tail). The money already
 * moved (reverseBookingPayouts clawed the transfer); this closes the silent
 * gap where a talent's payout vanished with no heads-up.
 *
 * Best-effort + idempotent (the emit is keyed on a stable origin_event_id), so
 * it never blocks the reversal and a webhook retry won't double-notify. Only
 * talent legs that were ACTUALLY reversed for a non-zero amount trigger a
 * talent bell — a partial, talent-protective clawback (workspace-only) leaves
 * the talent untouched and silent here, which is correct.
 */
export async function notifyBookingPayoutReversal(
  sb: SupabaseClient,
  bookingId: string,
  outcomes: ReversalOutcome[],
  reason: "dispute" | "refund",
): Promise<void> {
  try {
    // Idempotency without a synthetic event id: only fire when THIS call
    // actually reversed something. A re-delivered Stripe event makes
    // reverseBookingPayouts return result='noop' for already-reversed legs
    // (keyed per transfer), so a retry no-ops here and never re-notifies.
    if (!outcomes.some((o) => o.result === "reversed")) return;

    const reversedTalentLegs = outcomes.filter(
      (o) => o.party === "talent" && o.result === "reversed" && o.amountCents > 0,
    );

    const { data: booking } = await sb
      .from("agency_bookings")
      .select("source_inquiry_id, currency_code, tenant_id")
      .eq("id", bookingId)
      .maybeSingle();
    const tenantId = (booking as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const inquiryId = (booking as { source_inquiry_id?: string | null } | null)?.source_inquiry_id ?? null;
    const currency = (booking as { currency_code?: string | null } | null)?.currency_code ?? "USD";

    const reasonClause =
      reason === "dispute" ? "the client's payment was disputed" : "the client's payment was refunded";

    // ── Talent bells — one per actually-reversed talent leg. ──
    if (reversedTalentLegs.length > 0) {
      const partIds = reversedTalentLegs.map((l) => l.participantId);
      const { data: parts } = await sb
        .from("inquiry_participants")
        .select("id, user_id")
        .in("id", partIds);
      const userByPart = new Map(
        ((parts ?? []) as Array<{ id: string; user_id: string | null }>).map((p) => [p.id, p.user_id]),
      );
      for (const leg of reversedTalentLegs) {
        const uid = userByPart.get(leg.participantId);
        if (!uid) continue;
        await emitNotification({
          userId: uid,
          tenantId,
          kind: "payment",
          surface: "talent",
          title: "A payout was reversed",
          body: `Your payout of ${formatMoneyCents(leg.amountCents, currency)} was reversed because ${reasonClause}. Contact the coordinator if you think this is a mistake.`,
          targetDrawer: "money",
          // System-generated (origin_event_id is a UUID column for inquiry-
          // event-traced notifications; this isn't one). Idempotency comes from
          // the reversal-is-noop-on-retry guard above, not the unique index.
          originEventId: null,
          originKind: `payout_reversed_${reason}`,
          originInquiryId: inquiryId,
        });
      }
    }

    // ── Client bell — the payment on their booking was reversed. ──
    if (inquiryId) {
      const { data: inq } = await sb
        .from("inquiries")
        .select("client_user_id")
        .eq("id", inquiryId)
        .maybeSingle();
      const clientUid = (inq as { client_user_id?: string | null } | null)?.client_user_id ?? null;
      if (clientUid) {
        await emitNotification({
          userId: clientUid,
          tenantId,
          kind: "payment",
          surface: "client",
          title: reason === "dispute" ? "Payment dispute closed" : "Payment refunded",
          body:
            reason === "dispute"
              ? "The dispute on your booking payment was resolved and the charge was reversed."
              : "Your booking payment was refunded.",
          originEventId: null,
          originKind: `payment_reversed_${reason}`,
          originInquiryId: inquiryId,
        });
      }
    }
  } catch (err) {
    logServerError(`payout-reversal-notify[booking=${bookingId}]`, err);
  }
}
