import { logServerError } from "@/lib/server/safe-error";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logBookingActivity(
  supabase: SupabaseClient,
  args: {
    bookingId: string;
    actorUserId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("booking_activity_log").insert({
    booking_id: args.bookingId,
    actor_user_id: args.actorUserId,
    event_type: args.eventType,
    payload: args.payload ?? {},
  });
  if (error) {
    logServerError("commercial-audit/booking_activity_log", error);
  }
}

/**
 * Append a row to `inquiry_events` — the user-visible inquiry timeline.
 *
 * Historical note: this function used to insert into `inquiry_activity_log`,
 * a table that was dropped in migration 20260527000005_drop_activity_log.sql
 * and replaced by `inquiry_events` (success-only, user-visible) + a separate
 * `inquiry_action_log` (operational audit incl. failures). The dropped
 * write path silently failed for months. Restoring against `inquiry_events`
 * here keeps every legacy call site (~15 across inquiry-engine-*.ts) working
 * without a refactor.
 *
 * Defaults:
 *   • actor_role  = 'system' (DB default — most legacy callers pass an
 *                   inferred actor that maps via app context; for explicit
 *                   admin/coordinator/client/talent emissions, prefer
 *                   `emitStandardEngineEvent` in `inquiry-events.ts`).
 *   • visibility  = 'participants' (DB default — visible to client + talent
 *                   + staff).
 */
export async function logInquiryActivity(
  supabase: SupabaseClient,
  args: {
    inquiryId: string;
    actorUserId: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("inquiry_events").insert({
    inquiry_id: args.inquiryId,
    actor_user_id: args.actorUserId,
    event_type: args.eventType,
    payload: args.payload ?? {},
  });
  if (error) {
    logServerError("commercial-audit/inquiry_events", error);
  }
}
