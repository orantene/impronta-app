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

export async function logInquiryActivity(
  supabase: SupabaseClient,
  args: {
    inquiryId: string;
    actorUserId: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("inquiry_activity_log").insert({
    inquiry_id: args.inquiryId,
    actor_user_id: args.actorUserId,
    event_type: args.eventType,
    payload: args.payload ?? {},
  });
  if (error) {
    logServerError("commercial-audit/inquiry_activity_log", error);
  }
}
