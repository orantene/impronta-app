import "server-only";

import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { QA_FIXTURE_TENANT_IDS } from "@/lib/talent/qa-test-service";
import { parseAutoReviewConfig } from "./auto-review-config";
import { tenantAutoReviewRequestsEnabled } from "./auto-review-owner-switch";
import {
  AUTO_REVIEW_MAX_DAYS_AFTER_END,
  AUTO_REVIEW_RECIPIENT_COOLDOWN_DAYS,
  decideAutoReviewRequests,
  recipientKey,
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
/** `.in()` filters travel in the URL: keep each id list small. */
const ID_CHUNK = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
const PG_UNIQUE_VIOLATION = "23505";

export type AutoReviewRunSummary = {
  /** Why nothing ran: the kill switch is off or the cutoff is missing or bad (see auto-review-config.ts). */
  disabled: string | null;
  /** Candidates left for the next run by the per-run cap. */
  deferredByCap: number;
  scanned: number;
  created: number;
  invited: number;
  alreadyRequested: number;
  skippedNotEntitled: number;
  /** TUL-1328: tenant has `auto_review_requests_enabled = false`. */
  skippedOwnerOff: number;
  failed: number;
  /** Rows removed because the invite failed to send; the next run recreates them. */
  retryNextRun: number;
};

export async function runAutoReviewRequests(now: Date = new Date()): Promise<AutoReviewRunSummary> {
  const summary: AutoReviewRunSummary = {
    disabled: null,
    deferredByCap: 0,
    scanned: 0,
    created: 0,
    invited: 0,
    alreadyRequested: 0,
    skippedNotEntitled: 0,
    skippedOwnerOff: 0,
    failed: 0,
    retryNextRun: 0,
  };
  // Kill switch (default OFF) and first-run cutoff: no backfill of past bookings.
  const config = parseAutoReviewConfig(process.env, now);
  if (!config.enabled) {
    summary.disabled = config.reason;
    return summary;
  }
  const svc = createServiceRoleClient();
  if (!svc) return summary;

  try {
    // Never earlier than the first-run cutoff, never older than the look-back window.
    const windowStart = new Date(now.getTime() - (AUTO_REVIEW_MAX_DAYS_AFTER_END + 1) * 86_400_000);
    const cutoff = windowStart.getTime() > config.cutoff.getTime() ? windowStart : config.cutoff;
    const cutoffIso = cutoff.toISOString();
    const cutoffYmd = cutoffIso.slice(0, 10);
    const { data, error } = await svc
      .from("agency_bookings")
      .select(
        "id, tenant_id, status, payment_status, ends_at, starts_at, event_date, client_user_id, contact_email, order_id, title",
      )
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

    // Batches of 100 ids, so the filter never outgrows the request URL.
    const reqRows: Array<{ booking_id: string | null }> = [];
    const btRows: Array<{ booking_id: string; talent_profile_id: string }> = [];
    let lookupErr: unknown = null;
    for (const part of chunk(ids, ID_CHUNK)) {
      const [r, t] = await Promise.all([
        svc.from("review_requests").select("booking_id").in("booking_id", part),
        svc.from("booking_talent").select("booking_id, talent_profile_id").in("booking_id", part),
      ]);
      if (r.error || t.error) {
        lookupErr = r.error ?? t.error;
        break;
      }
      reqRows.push(...((r.data ?? []) as typeof reqRows));
      btRows.push(...((t.data ?? []) as typeof btRows));
    }
    if (lookupErr) {
      // Without both answers "already asked" and "one talent" cannot be judged:
      // refuse the run rather than guess. The next daily run retries.
      logServerError("reviews/auto/lookup", lookupErr);
      summary.failed += 1;
      return summary;
    }
    const requestedBookingIds = new Set(
      reqRows.map((r) => r.booking_id).filter((v): v is string => !!v),
    );
    const talentsByBooking = new Map<string, string[]>();
    for (const r of btRows) {
      const list = talentsByBooking.get(r.booking_id) ?? [];
      list.push(r.talent_profile_id);
      talentsByBooking.set(r.booking_id, list);
    }

    // Frequency guard: people who already got an automatic request recently.
    const recentRecipientKeys = new Set<string>();
    const candidateEmails = [...new Set(bookings.map((b) => (b.contact_email ?? "").trim().toLowerCase()).filter(Boolean))];
    const candidateUsers = [...new Set(bookings.map((b) => b.client_user_id).filter((v): v is string => !!v))];
    const sinceIso = new Date(now.getTime() - AUTO_REVIEW_RECIPIENT_COOLDOWN_DAYS * 86_400_000).toISOString();
    for (const part of chunk(candidateEmails, ID_CHUNK)) {
      const { data: recent, error: recentErr } = await svc
        .from("review_requests")
        .select("invited_email, client_user_id")
        .eq("source", "auto")
        .gte("created_at", sinceIso)
        .in("invited_email", part);
      if (recentErr) {
        // Without the answer the guard cannot be applied: refuse the run (fail closed).
        logServerError("reviews/auto/recent", recentErr);
        summary.failed += 1;
        return summary;
      }
      for (const r of (recent ?? []) as Array<{ invited_email: string | null; client_user_id: string | null }>) {
        const k = recipientKey(r.client_user_id, (r.invited_email ?? "").trim().toLowerCase() || null);
        if (k) recentRecipientKeys.add(k);
        if (r.invited_email) recentRecipientKeys.add(`email:${r.invited_email.trim().toLowerCase()}`);
      }
    }
    for (const part of chunk(candidateUsers, ID_CHUNK)) {
      const { data: recent, error: recentErr } = await svc
        .from("review_requests")
        .select("client_user_id")
        .eq("source", "auto")
        .gte("created_at", sinceIso)
        .in("client_user_id", part);
      if (recentErr) {
        logServerError("reviews/auto/recent", recentErr);
        summary.failed += 1;
        return summary;
      }
      for (const r of (recent ?? []) as Array<{ client_user_id: string | null }>) {
        if (r.client_user_id) recentRecipientKeys.add(`user:${r.client_user_id}`);
      }
    }

    const decision = decideAutoReviewRequests({
      now,
      bookings,
      talentsByBooking,
      requestedBookingIds,
      cutoff: config.cutoff,
      recentRecipientKeys,
      fixtureTenantIds: QA_FIXTURE_TENANT_IDS,
    });
    summary.alreadyRequested = decision.skipped.already_requested;
    summary.deferredByCap = decision.skipped.over_cap;

    const entitled = new Map<string, boolean>();
    const ownerOn = new Map<string, boolean>();
    for (const d of decision.due) {
      const b = d.booking;
      // Set once the row exists, cleared once the invite is out: whatever throws in
      // between, the row is removed so the next run creates it and tries again.
      let uninvitedRowId: string | null = null;
      try {
        if (!entitled.has(b.tenant_id)) entitled.set(b.tenant_id, await tenantReviewsEnabled(b.tenant_id));
        if (!entitled.get(b.tenant_id)) {
          summary.skippedNotEntitled += 1;
          continue;
        }
        // TUL-1328: distinct from the surface switch above — a business can keep
        // reviews visible while opting out of the automatic request email itself.
        if (!ownerOn.has(b.tenant_id)) ownerOn.set(b.tenant_id, await tenantAutoReviewRequestsEnabled(b.tenant_id));
        if (!ownerOn.get(b.tenant_id)) {
          summary.skippedOwnerOff += 1;
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
        uninvitedRowId = created.id;

        const { data: talent, error: talentErr } = await svc
          .from("talent_profiles")
          .select("display_name")
          .eq("id", d.talentProfileId)
          .maybeSingle<{ display_name: string | null }>();
        // The name only personalises the invite; without it the email uses its neutral wording.
        if (talentErr) logServerError("reviews/auto/talent-name", talentErr);
        const locale = await bookingLocaleOf(svc, b.id);
        const serviceName = await loadOfferingDisplayTitle(svc, offeringId, locale ?? "en");
        const reviewUrl = created.invite_token
          ? `${getAppUrl()}/review/${encodeURIComponent(created.invite_token)}`
          : `${getAppUrl()}/`;
        let sent: Awaited<ReturnType<typeof dispatchEventNotifications>>;
        try {
          sent = await dispatchEventNotifications({
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
        } catch (err) {
          logServerError("reviews/auto/dispatch", err);
          sent = { dispatched: 0, suppressed: 0, failed: 1, queued: 0 };
        }
        if (sent.dispatched > 0) {
          summary.invited += 1;
          uninvitedRowId = null;
        } else if (sent.failed === 0) {
          // Suppressed, skipped or queued on purpose (opt-out, no provider key): nothing to retry.
          uninvitedRowId = null;
        }
      } catch (err) {
        logServerError("reviews/auto/booking", err);
        summary.failed += 1;
      }
      if (uninvitedRowId) {
        // The invite never went out. Remove the row so the next daily run creates
        // it and tries again: a request is never silently lost.
        const { error: delErr } = await svc
          .from("review_requests")
          .delete()
          .eq("id", uninvitedRowId)
          .eq("source", "auto")
          .eq("status", "pending");
        if (delErr) logServerError("reviews/auto/rollback", delErr);
        else summary.retryNextRun += 1;
      }
    }
  } catch (err) {
    logServerError("reviews/auto/run", err);
    summary.failed += 1;
  }
  return summary;
}
