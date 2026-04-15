import type { SupabaseClient } from "@supabase/supabase-js";

export type SystemEventType =
  | "inquiry_created"
  | "coordinator_assigned"
  | "coordinator_accepted"
  | "coordinator_declined"
  | "talent_invited"
  | "talent_accepted"
  | "talent_declined"
  | "talent_removed"
  | "offer_sent"
  | "offer_revised"
  | "offer_accepted"
  | "offer_rejected"
  | "approval_received"
  | "all_approvals_complete"
  | "inquiry_booked"
  | "inquiry_rejected"
  | "inquiry_expired"
  | "roster_changed_offer_invalidated";

export async function insertSystemMessage(
  supabase: SupabaseClient,
  args: {
    inquiryId: string;
    threadType: "private" | "group";
    eventType: SystemEventType;
    body: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("inquiry_messages").insert({
    inquiry_id: args.inquiryId,
    thread_type: args.threadType,
    sender_user_id: null,
    body: args.body,
    metadata: {
      system_event_type: args.eventType,
      ...(args.metadata ?? {}),
    },
  });
  if (error) {
    const { logServerError } = await import("@/lib/server/safe-error");
    logServerError("inquiry-system-messages/insert", error);
  }
}
