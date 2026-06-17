import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotification } from "@/lib/notifications/emit";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
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
 * Sends BOTH an in-app bell (emitNotification, keeping its money-drawer
 * deep-link) and an email via the notification dispatcher (catalog entries
 * payment.payout_reversed / payment.refunded — suppression-checked, logged to
 * notification_dispatch_log, unsubscribe footer). Best-effort + idempotent via the
 * reversal-is-noop-on-retry guard below (not the unique index), so it never
 * blocks the reversal and a webhook retry won't double-notify. Only talent legs
 * that were ACTUALLY reversed for a non-zero amount trigger a talent notice — a
 * partial, talent-protective clawback (workspace-only) leaves the talent
 * untouched and silent here, which is correct.
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
        // Email via the dispatcher (suppression-checked, logged, unsubscribe
        // footer) — the catalog resolver hydrates the talent's address from the
        // participant. Awaited: this runs in the Stripe webhook context where a
        // fire-and-forget tail is dropped once the route responds.
        await dispatchEventNotifications({
          type: "payment.payout_reversed",
          tenantId,
          inquiryId,
          eventId: `payout-reversed:${reason}:${bookingId}:${leg.participantId}`,
          payload: {
            participantId: leg.participantId,
            amountCents: leg.amountCents,
            currency,
            reason,
          },
        });
      }
    }

    // ── Client bell — the payment on their booking was reversed. ──
    if (inquiryId) {
      const { data: inq } = await sb
        .from("inquiries")
        .select("client_user_id, contact_email")
        .eq("id", inquiryId)
        .maybeSingle();
      const clientUid = (inq as { client_user_id?: string | null } | null)?.client_user_id ?? null;
      const clientEmail = (inq as { contact_email?: string | null } | null)?.contact_email ?? null;
      const clientTitle = reason === "dispute" ? "Payment dispute closed" : "Payment refunded";
      const clientBody =
        reason === "dispute"
          ? "The dispute on your booking payment was resolved and the charge was reversed."
          : "Your booking payment was refunded.";
      if (clientUid) {
        await emitNotification({
          userId: clientUid,
          tenantId,
          kind: "payment",
          surface: "client",
          title: clientTitle,
          body: clientBody,
          originEventId: null,
          originKind: `payment_reversed_${reason}`,
          originInquiryId: inquiryId,
        });
      }
      // Email the client via the dispatcher (suppression + log + unsubscribe);
      // fires for a guest contact too (refundedClient resolves email-only).
      if (clientUid || clientEmail) {
        await dispatchEventNotifications({
          type: "payment.refunded",
          tenantId,
          inquiryId,
          eventId: `payment-refunded:${reason}:${bookingId}`,
          payload: { clientUserId: clientUid, clientEmail, reason },
        });
      }
    }
  } catch (err) {
    logServerError(`payout-reversal-notify[booking=${bookingId}]`, err);
  }
}

/**
 * Notify the CLIENT of a partial refund on their booking (audit #14 tail). The
 * talent is protected from a partial-refund clawback, so only the client is
 * told the amount that went back. In-app bell + email (best-effort). Callers
 * should invoke this only when the partial refund was NEWLY recorded so a
 * webhook re-delivery doesn't re-notify (there's no synthetic dedup key here).
 */
export async function notifyClientPartialRefund(
  sb: SupabaseClient,
  bookingId: string,
  refundedCents: number,
): Promise<void> {
  if (refundedCents <= 0) return;
  try {
    const { data: booking } = await sb
      .from("agency_bookings")
      .select("source_inquiry_id, currency_code, tenant_id")
      .eq("id", bookingId)
      .maybeSingle();
    const inquiryId = (booking as { source_inquiry_id?: string | null } | null)?.source_inquiry_id ?? null;
    if (!inquiryId) return;
    const tenantId = (booking as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const currency = (booking as { currency_code?: string | null } | null)?.currency_code ?? "USD";

    const { data: inq } = await sb
      .from("inquiries")
      .select("client_user_id, contact_email")
      .eq("id", inquiryId)
      .maybeSingle();
    const clientUid = (inq as { client_user_id?: string | null } | null)?.client_user_id ?? null;
    const clientEmail = (inq as { contact_email?: string | null } | null)?.contact_email ?? null;

    const title = "Partial refund issued";
    const body = `A partial refund of ${formatMoneyCents(refundedCents, currency)} was issued to your original payment method.`;
    if (clientUid) {
      await emitNotification({
        userId: clientUid,
        tenantId,
        kind: "payment",
        surface: "client",
        title,
        body,
        originEventId: null,
        originKind: "partial_refund",
        originInquiryId: inquiryId,
      });
    }
    if (clientUid || clientEmail) {
      await dispatchEventNotifications({
        type: "payment.partial_refund",
        tenantId,
        inquiryId,
        eventId: `partial-refund:${bookingId}:${refundedCents}`,
        payload: { clientUserId: clientUid, clientEmail, refundedCents, currency },
      });
    }
  } catch (err) {
    logServerError(`partial-refund-notify[booking=${bookingId}]`, err);
  }
}

/**
 * Notify a talent that their payout is HELD because the snapshot lane currency
 * doesn't match the currency the client charge settled in (P1 hardening — a
 * legacy mixed-currency booking). The leg is recorded as `held` in the payouts
 * ledger and surfaces on the platform-admin held-payouts dashboard for manual
 * reconciliation; this in-app bell makes sure the talent isn't left silently
 * unpaid with no heads-up. Best-effort + never throws (the charge already
 * settled). No email catalog entry exists for a held leg, so this is the in-app
 * bell only, matching how other held legs surface (the admin dashboard is the
 * operational source of truth).
 */
export async function notifyCurrencyMismatchHold(
  sb: SupabaseClient,
  bookingId: string,
  participantId: string,
  amountCents: number,
  laneCurrency: string,
): Promise<void> {
  if (amountCents <= 0) return;
  try {
    const { data: booking } = await sb
      .from("agency_bookings")
      .select("source_inquiry_id, tenant_id")
      .eq("id", bookingId)
      .maybeSingle();
    const tenantId = (booking as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const inquiryId = (booking as { source_inquiry_id?: string | null } | null)?.source_inquiry_id ?? null;

    const { data: part } = await sb
      .from("inquiry_participants")
      .select("user_id")
      .eq("id", participantId)
      .maybeSingle();
    const uid = (part as { user_id?: string | null } | null)?.user_id ?? null;
    if (!uid) return;

    await emitNotification({
      userId: uid,
      tenantId,
      kind: "payment",
      surface: "talent",
      title: "A payout is on hold",
      body: `Your payout of ${formatMoneyCents(amountCents, laneCurrency)} is on hold because of a currency mismatch on this booking. Our team will reconcile it — contact the coordinator if you have questions.`,
      targetDrawer: "money",
      originEventId: null,
      originKind: "payout_held_currency_mismatch",
      originInquiryId: inquiryId,
    });
  } catch (err) {
    logServerError(`currency-mismatch-hold-notify[booking=${bookingId}]`, err);
  }
}
