import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotification } from "@/lib/notifications/emit";
import { sendEmail } from "@/lib/email";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import { logServerError } from "@/lib/server/safe-error";

/** The minimal shape of a reverseBookingPayouts() outcome we read here. */
type ReversalOutcome = {
  participantId: string;
  party: string;
  amountCents: number;
  result: string;
};

/** Minimal transactional HTML for the one-off reversal notice. `sendEmail`
 *  no-ops without RESEND_API_KEY, so this is safe (and silent) in dev/test. */
function noticeEmailHtml(title: string, body: string): string {
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b0b0d">` +
    `<h2 style="font-size:18px;margin:0 0 12px">${title}</h2>` +
    `<p style="font-size:14px;line-height:1.5;color:#3a3a40;margin:0">${body}</p></div>`
  );
}

/**
 * Notify the affected talent(s) + the client when a booking's payouts are
 * reversed by a lost dispute or a refund (audit #14 tail). The money already
 * moved (reverseBookingPayouts clawed the transfer); this closes the silent
 * gap where a talent's payout vanished with no heads-up.
 *
 * Sends BOTH an in-app bell (emitNotification) and an email (sendEmail, which
 * no-ops without RESEND_API_KEY). Best-effort + idempotent via the
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
        // Email (best-effort; no-ops without RESEND_API_KEY). Resolve the
        // talent's account email from auth — profiles carries no email.
        const { data: authUser } = await sb.auth.admin.getUserById(uid);
        const talentEmail = authUser?.user?.email ?? null;
        if (talentEmail) {
          await sendEmail({
            to: talentEmail,
            subject: "A payout was reversed",
            html: noticeEmailHtml(
              "A payout was reversed",
              `Your payout of ${formatMoneyCents(leg.amountCents, currency)} was reversed because ${reasonClause}. Please contact the coordinator if you think this is a mistake.`,
            ),
          });
        }
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
      // Email the client too (best-effort; no-ops without RESEND_API_KEY).
      if (clientEmail) {
        await sendEmail({
          to: clientEmail,
          subject: clientTitle,
          html: noticeEmailHtml(clientTitle, clientBody),
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
    if (clientEmail) {
      await sendEmail({ to: clientEmail, subject: title, html: noticeEmailHtml(title, body) });
    }
  } catch (err) {
    logServerError(`partial-refund-notify[booking=${bookingId}]`, err);
  }
}
