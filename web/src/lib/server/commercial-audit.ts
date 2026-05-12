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
 * Division of responsibility:
 *   Use this function for standalone server-action callers (admin-inquiries.ts,
 *   admin-bookings.ts, etc.) that perform a single write and do NOT need
 *   side-effects (system messages, push notifications, improntaLog observability).
 *   These callers are NOT in the inquiry engine and have no `emitStandardEngineEvent`
 *   counterpart — so there is no duplication.
 *
 *   For engine actions in inquiry-engine-*.ts, use `emitStandardEngineEvent`
 *   from `@/lib/inquiry/inquiry-events` instead. It writes to `inquiry_events`
 *   AND dispatches side-effects (system messages, notifications, structured
 *   observability) via the in-process listener chain. The engine files no
 *   longer call this function.
 *
 * Historical note: this function used to insert into `inquiry_activity_log`,
 * a table dropped in migration 20260527000005_drop_activity_log.sql and
 * replaced by `inquiry_events`. The dropped path silently failed for months.
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
