import "server-only";

import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  AUTO_REVIEW_MAX_DAYS_AFTER_END,
  decideAutoReviewRequests,
  type AutoReviewBooking,
} from "./auto-review-request-plan";
import { bookingLocaleOf, loadOfferingDisplayTitle, offeringIdForBooking } from "./review-offering";
import { tenantReviewsEnabled } from "./reviews-entitlement";

/**
 * G2: the automatic review request after a completed booking.
 *
 * Swept once a day from the booking-reminders cron (the same place the day-7
 * reminder runs). For each due booking (see `decideAutoReviewRequests`) it
 * stores ONE `review_requests` row (source 'auto', tied to the service that was
 * sold) and sends the same invite the manual flow sends, through the dispatcher,
 * so it inherits suppressions, the `reviews` preference and unsubscribe links.
 *
 * Idempotent three ways: the plan skips a booking that has any request, the
 * database has a unique partial index on the automatic request per booking, and
 * the invite's eventId is stable (`review-invite:<requestId>`). Emails go only
 * to the booking's own client. Best-effort: nothing here throws.
 */

const BOOKING_LIMIT = 500;
const PG_UNIQUE_VIOLATION = "23505";

export type AutoReviewRunSummary = {
  scanned: number;
  created: number;
  invited: number;
  alreadyRequested: number;
  skippedNotEntitled: number;
  failed: number;
};

export async function runAutoReviewRequests(now: Date = new Date()): Promise<AutoReviewRunSummary> {
  const summary: AutoReviewRunSummary = {
    scanned: 0,
    created: 0,
    invited: 0,
    alreadyRequested: 0,
    skippedNotEntitled: 0,
    failed: 0,
  };
  const svc = createServiceRoleClient();
  if (!svc) return summary;

  try {
    const cutoff = new Date(now.getTime() - (AUTO_REVIEW_MAX_DAYS_AFTER_END + 1) * 86_400_000);
    const cutoffIso = cutoff.toISOString();
    const cutoffYmd = cutoffIso.slice(0, 10);
    const { data, error } = await svc
      .from("agency_bookings")
      .select("id, tenant_id, status, ends_at, starts_at, event_date, client_user_id, contact_email, order_id, title")
      .eq("status", "completed")
      .or(
        `ends_at.gte.${cutoffIso},` +
          `and(ends_at.is.null,starts_at.gte.${cutoffIso}),` +
          `and(ends_at.is.null,starts_at.is.null,event_date.gte.${cutoffYmd})`,
      )
      .limit(BOOKING_LIMIT)
      .returns<AutoReviewBooking[]>();
    if (error) {
      logServerError("reviews/auto/select", error);
      summary.failed += 1;
      return summary;
    }
    const bookings = data ?? [];
    summary.scanned = bookings.length;
    if (bookings.length === 0) return summary;
    const ids = bookings.map((b) => b.id);

    const [{ data: reqRows, error: reqErr }, { data: btRows, error: btErr }] = await Promise.all([
      svc.from("review_requests").select("booking_id").in("booking_id", ids),
      svc.from("booking_talent").select("booking_id, talent_profile_id").in("booking_id", ids),
    ]);
    if (reqErr || btErr) {
      // Without both answers "already asked" and "one talent" cannot be judged:
      // refuse the run rather than guess. The next daily run retries.
      logServerError("reviews/auto/lookup", reqErr ?? btErr);
      summary.failed += 1;
      return summary;
    }
    const requestedBookingIds = new Set(
      ((reqRows ?? []) as Array<{ booking_id: string | null }>).map((r) => r.booking_id).filter((v): v is string => !!v),
    );
    const talentsByBooking = new Map<string, string[]>();
    for (const r of (btRows ?? []) as Array<{ booking_id: string; talent_profile_id: string }>) {
      const list = talentsByBooking.get(r.booking_id) ?? [];
      list.push(r.talent_profile_id);
      talentsByBooking.set(r.booking_id, list);
    }

    const decision = decideAutoReviewRequests({ now, bookings, talentsByBooking, requestedBookingIds });
    summary.alreadyRequested = decision.skipped.already_requested;

    const entitled = new Map<string, boolean>();
    for (const d of decision.due) {
      const b = d.booking;
      try {
        if (!entitled.has(b.tenant_id)) entitled.set(b.tenant_id, await tenantReviewsEnabled(b.tenant_id));
        if (!entitled.get(b.tenant_id)) {
          summary.skippedNotEntitled += 1;
          continue;
        }

        const offeringId = await offeringIdForBooking(svc, b.id);
        const { data: created, error: insErr } = await svc
          .from("review_requests")
          .insert({
            tenant_id: b.tenant_id,
            talent_profile_id: d.talentProfileId,
            booking_id: b.id,
            client_user_id: d.clientUserId,
            invited_email: d.invitedEmail,
            status: "pending",
            source: "auto",
            offering_id: offeringId,
          })
          .select("id, invite_token")
          .maybeSingle<{ id: string; invite_token: string | null }>();
        if (insErr) {
          if (insErr.code === PG_UNIQUE_VIOLATION) {
            summary.alreadyRequested += 1;
          } else {
            logServerError("reviews/auto/insert", insErr);
            summary.failed += 1;
          }
          continue;
        }
        if (!created?.id) continue;
        summary.created += 1;

        const { data: talent } = await svc
          .from("talent_profiles")
          .select("display_name")
          .eq("id", d.talentProfileId)
          .maybeSingle<{ display_name: string | null }>();
        const locale = await bookingLocaleOf(svc, b.id);
        const serviceName = await loadOfferingDisplayTitle(svc, offeringId, locale ?? "en");
        const reviewUrl = created.invite_token
          ? `${getAppUrl()}/review/${encodeURIComponent(created.invite_token)}`
          : `${getAppUrl()}/`;
        const sent = await dispatchEventNotifications({
          type: "review.request_created",
          tenantId: b.tenant_id,
          eventId: `review-invite:${created.id}`,
          payload: {
            clientUserId: d.clientUserId,
            invitedEmail: d.invitedEmail,
            locale,
            talentName: talent?.display_name ?? null,
            // The service is what the review is about; the booking title is the fallback.
            eventTitle: serviceName ?? b.title,
            eventDate: b.event_date ?? b.starts_at,
            reviewUrl,
          },
        });
        if (sent.dispatched > 0) summary.invited += 1;
      } catch (err) {
        logServerError("reviews/auto/booking", err);
        summary.failed += 1;
      }
    }
  } catch (err) {
    logServerError("reviews/auto/run", err);
    summary.failed += 1;
  }
  return summary;
}
