import "server-only";

import { getAppUrl } from "@/lib/auth-flow";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Review-request reminder producer (STANDING v2, spec §Phase 2).
 *
 * Sends ONE gentle follow-up for a review request that is still `pending` about
 * a week after the invite. It selects `review_requests` rows that are:
 *   - status = 'pending' (unanswered),
 *   - created_at older than 7 days,
 *   - reminded_at IS NULL (never reminded — caps reminders at exactly one),
 *   - not past expires_at (a lapsed invite is not re-nudged).
 *
 * For each match it emits `review.request_reminded` through the dispatcher — so
 * the reminder inherits `email_suppressions`, the `reviews` category preference,
 * unsubscribe headers, and localized copy — then stamps `reminded_at` so a
 * re-run of this producer is a no-op for the same row (the stamp is the cursor;
 * the dispatch_log dedupe on the stable `eventId` is a second safety net).
 *
 * Best-effort throughout: a per-row failure is logged and skipped so one bad row
 * never blocks the rest of the sweep.
 *
 * ── Scheduling ────────────────────────────────────────────────────────────────
 * There is no dedicated review cron yet. This producer is safe to call from any
 * daily sweep (it is idempotent via `reminded_at`). Wire it into an existing
 * daily cron route (e.g. alongside `booking-reminders`) with a single line:
 *   `await runReviewRequestReminders();`
 * Do NOT invent new cron infrastructure for it.
 */

type PendingRequestRow = {
  id: string;
  tenant_id: string;
  talent_profile_id: string | null;
  booking_id: string | null;
  client_user_id: string | null;
  invited_email: string | null;
  invite_token: string | null;
};

/** How old (days) a pending request must be before the single reminder fires. */
const REMINDER_AFTER_DAYS = 7;
/** Safety cap on how many reminders one sweep sends. */
const REMINDER_BATCH_LIMIT = 200;

export async function runReviewRequestReminders(): Promise<{
  scanned: number;
  reminded: number;
}> {
  const result = { scanned: 0, reminded: 0 };
  const admin = createServiceRoleClient();
  if (!admin) return result;

  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(
    Date.now() - REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Pending, aged past the cutoff, never reminded. `expires_at` is filtered in
  // JS below (PostgREST cannot express "expires_at IS NULL OR expires_at > now"
  // in one .or() cleanly against a nullable column without ambiguity).
  const { data, error } = await admin
    .from("review_requests")
    .select(
      "id, tenant_id, talent_profile_id, booking_id, client_user_id, invited_email, invite_token, expires_at",
    )
    .eq("status", "pending")
    .is("reminded_at", null)
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(REMINDER_BATCH_LIMIT)
    .returns<(PendingRequestRow & { expires_at: string | null })[]>();

  if (error) {
    logServerError("reviews/reminder/select", error);
    return result;
  }

  const rows = (data ?? []).filter(
    (r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now(),
  );
  result.scanned = rows.length;

  for (const row of rows) {
    try {
      // A row can be addressed to a known client OR an invited email; skip a row
      // that has neither (nothing to send to).
      if (!row.client_user_id && !row.invited_email) continue;

      const { talentName, eventTitle, eventDate } = await resolveContext(
        admin,
        row.talent_profile_id,
        row.booking_id,
      );

      const reviewUrl = row.invite_token
        ? `${getAppUrl()}/review/${encodeURIComponent(row.invite_token)}`
        : `${getAppUrl()}/`;

      await dispatchEventNotifications({
        type: "review.request_reminded",
        tenantId: row.tenant_id,
        eventId: `review-reminder:${row.id}`,
        payload: {
          clientUserId: row.client_user_id,
          invitedEmail: row.invited_email,
          talentName,
          eventTitle,
          eventDate,
          reviewUrl,
        },
      });

      // Stamp the cursor. A failed stamp only risks a duplicate on the next
      // sweep, which the `eventId` dedupe on the dispatch_log absorbs.
      const { error: stampErr } = await admin
        .from("review_requests")
        .update({ reminded_at: nowIso })
        .eq("id", row.id);
      if (stampErr) {
        logServerError("reviews/reminder/stamp", stampErr);
        continue;
      }
      result.reminded += 1;
    } catch (err) {
      logServerError("reviews/reminder/row", err);
    }
  }

  return result;
}

/** Resolve the talent display name + booking event title/date for a row. */
async function resolveContext(
  admin: ReturnType<typeof createServiceRoleClient>,
  talentProfileId: string | null,
  bookingId: string | null,
): Promise<{
  talentName: string | null;
  eventTitle: string | null;
  eventDate: string | null;
}> {
  if (!admin) return { talentName: null, eventTitle: null, eventDate: null };

  let talentName: string | null = null;
  if (talentProfileId) {
    const { data } = await admin
      .from("talent_profiles")
      .select("display_name")
      .eq("id", talentProfileId)
      .maybeSingle();
    talentName = (data as { display_name: string | null } | null)?.display_name ?? null;
  }

  let eventTitle: string | null = null;
  let eventDate: string | null = null;
  if (bookingId) {
    const { data } = await admin
      .from("agency_bookings")
      .select("title, event_date")
      .eq("id", bookingId)
      .maybeSingle();
    const b = data as { title: string | null; event_date: string | null } | null;
    eventTitle = b?.title ?? null;
    eventDate = b?.event_date ?? null;
  }

  return { talentName, eventTitle, eventDate };
}
