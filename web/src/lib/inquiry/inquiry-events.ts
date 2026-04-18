import type { SupabaseClient } from "@supabase/supabase-js";
import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";
import { insertSystemMessage, type SystemEventType } from "./inquiry-system-messages";
import { notifyUsers } from "./inquiry-notifications";

export type EngineEventPriority = "high" | "medium" | "low";

export const ENGINE_EVENT_TYPES = {
  // Inquiry lifecycle / workflow
  INQUIRY_SUBMITTED: "inquiry.submitted",
  INQUIRY_MOVED_TO_COORDINATION: "inquiry.moved_to_coordination",
  INQUIRY_PRIORITY_SET: "inquiry.priority_set",
  INQUIRY_FROZEN: "inquiry.frozen",
  INQUIRY_UNFROZEN: "inquiry.unfrozen",
  INQUIRY_ARCHIVED: "inquiry.archived",
  INQUIRY_EXPIRED: "inquiry.expired",
  COORDINATOR_ASSIGNMENT_TIMED_OUT: "coordinator.assignment_timed_out",

  // Messaging
  MESSAGE_SENT: "inquiry.message_sent",

  // Coordinator
  COORDINATOR_ASSIGNED: "coordinator.assigned",
  COORDINATOR_ACCEPTED: "coordinator.accepted",
  COORDINATOR_DECLINED: "coordinator.declined",
  // Multi-coordinator (Admin Workspace V3, M2.1). These values match the
  // event_type strings written by engine_{add,remove}_secondary_coordinator /
  // engine_promote_to_primary RPCs into inquiry_events. The in-process
  // listeners in this file fire for *additional* side-effects (system msgs,
  // notifications, improntaLog) — the DB write already happened in the RPC.
  SECONDARY_COORDINATOR_ASSIGNED: "secondary_coordinator_assigned",
  SECONDARY_COORDINATOR_UNASSIGNED: "secondary_coordinator_unassigned",
  PRIMARY_COORDINATOR_CHANGED: "primary_coordinator_changed",

  // Roster
  ROSTER_TALENT_INVITED: "roster.talent_invited",
  ROSTER_TALENT_REMOVED: "roster.talent_removed",
  ROSTER_REORDERED: "roster.reordered",
  ROSTER_TALENT_ACCEPTED: "roster.talent_accepted",
  ROSTER_TALENT_DECLINED: "roster.talent_declined",
  OFFER_INVALIDATED_BY_ROSTER_CHANGE: "offer.invalidated_by_roster_change",

  // Offers + approvals
  OFFER_CREATED: "offer.created",
  OFFER_DRAFT_UPDATED: "offer.draft_updated",
  OFFER_SENT: "offer.sent",
  OFFER_CLIENT_REJECTED: "offer.client_rejected",

  APPROVAL_SUBMITTED: "approval.submitted",
  APPROVAL_REJECTED: "approval.rejected",
  APPROVALS_COMPLETED: "approval.all_complete",

  // Booking
  BOOKING_CREATED: "booking.created",
} as const;

export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[keyof typeof ENGINE_EVENT_TYPES];

export type EngineNotification = { userId: string; title: string; body?: string | null };
export type EngineSystemMessage = { threadType: "private" | "group"; body: string; eventType: SystemEventType };

export type EngineEvent = {
  type: EngineEventType;
  inquiryId: string;
  actorUserId: string | null;
  timestamp: string;
  priority: EngineEventPriority;
  payload: {
    data: Record<string, unknown>;
    systemMessage?: EngineSystemMessage;
    notifications?: EngineNotification[];
  };
};

type Listener = (
  supabase: SupabaseClient,
  event: EngineEvent,
) => Promise<void>;

const listeners: Listener[] = [
  async (supabase, event) => {
    const sm = event.payload.systemMessage as
      | {
          threadType: "private" | "group";
          body: string;
          eventType: SystemEventType;
        }
      | undefined;
    if (sm) {
      await insertSystemMessage(supabase, {
        inquiryId: event.inquiryId,
        threadType: sm.threadType,
        eventType: sm.eventType,
        body: sm.body,
      });
    }
  },
  async (supabase, event) => {
    const notes = event.payload.notifications as
      | Array<{ userId: string; title: string; body?: string | null }>
      | undefined;
    if (notes?.length) {
      await notifyUsers(
        supabase,
        notes.map((n) => ({ userId: n.userId, title: n.title, body: n.body })),
      );
    }
  },
  async (supabase, event) => {
    await improntaLog("inquiry_engine.observability", {
      action: event.type,
      inquiryId: event.inquiryId,
      actorUserId: event.actorUserId,
      priority: event.priority,
    });
  },
];

/**
 * In-process dispatcher for post-commit effects (Section 2.18).
 * Extend `listeners` with system messages / notifications when wiring.
 */
export async function emitEngineEvents(
  supabase: SupabaseClient,
  event: EngineEvent,
): Promise<{ errors: Array<{ listener: string; error: Error }> }> {
  const errors: Array<{ listener: string; error: Error }> = [];
  const eventId = crypto.randomUUID();

  for (let i = 0; i < listeners.length; i++) {
    const listener = listeners[i];
    try {
      await listener(supabase, event);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      errors.push({ listener: `listener_${i}`, error: err });
      const { error: insErr } = await supabase.from("failed_engine_effects").insert({
        inquiry_id: event.inquiryId,
        event_id: eventId,
        listener_name: `listener_${i}`,
        engine_action: event.type,
        failed_step: "listener_exception",
        payload: { message: err.message, stack: err.stack },
        priority: event.priority,
      });
      if (insErr) logServerError("inquiry-events/failed_effect_insert", insErr);
      await supabase
        .from("inquiries")
        .update({ has_failed_effects: true })
        .eq("id", event.inquiryId);
    }
  }

  return { errors };
}

export function registerEngineEventListener(listener: Listener): void {
  listeners.push(listener);
}

const DEFAULT_PRIORITY: Record<EngineEventType, EngineEventPriority> = {
  [ENGINE_EVENT_TYPES.INQUIRY_SUBMITTED]: "high",
  [ENGINE_EVENT_TYPES.INQUIRY_MOVED_TO_COORDINATION]: "medium",
  [ENGINE_EVENT_TYPES.INQUIRY_PRIORITY_SET]: "low",
  [ENGINE_EVENT_TYPES.INQUIRY_FROZEN]: "high",
  [ENGINE_EVENT_TYPES.INQUIRY_UNFROZEN]: "medium",
  [ENGINE_EVENT_TYPES.INQUIRY_ARCHIVED]: "low",
  [ENGINE_EVENT_TYPES.INQUIRY_EXPIRED]: "medium",
  [ENGINE_EVENT_TYPES.COORDINATOR_ASSIGNMENT_TIMED_OUT]: "high",
  [ENGINE_EVENT_TYPES.MESSAGE_SENT]: "low",
  [ENGINE_EVENT_TYPES.COORDINATOR_ASSIGNED]: "high",
  [ENGINE_EVENT_TYPES.COORDINATOR_ACCEPTED]: "high",
  [ENGINE_EVENT_TYPES.COORDINATOR_DECLINED]: "high",
  [ENGINE_EVENT_TYPES.SECONDARY_COORDINATOR_ASSIGNED]: "medium",
  [ENGINE_EVENT_TYPES.SECONDARY_COORDINATOR_UNASSIGNED]: "medium",
  [ENGINE_EVENT_TYPES.PRIMARY_COORDINATOR_CHANGED]: "high",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_INVITED]: "medium",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_REMOVED]: "medium",
  [ENGINE_EVENT_TYPES.ROSTER_REORDERED]: "low",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_ACCEPTED]: "medium",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_DECLINED]: "medium",
  [ENGINE_EVENT_TYPES.OFFER_INVALIDATED_BY_ROSTER_CHANGE]: "high",
  [ENGINE_EVENT_TYPES.OFFER_CREATED]: "medium",
  [ENGINE_EVENT_TYPES.OFFER_DRAFT_UPDATED]: "low",
  [ENGINE_EVENT_TYPES.OFFER_SENT]: "high",
  [ENGINE_EVENT_TYPES.OFFER_CLIENT_REJECTED]: "high",
  [ENGINE_EVENT_TYPES.APPROVAL_SUBMITTED]: "medium",
  [ENGINE_EVENT_TYPES.APPROVAL_REJECTED]: "high",
  [ENGINE_EVENT_TYPES.APPROVALS_COMPLETED]: "high",
  [ENGINE_EVENT_TYPES.BOOKING_CREATED]: "high",
};

export async function emitStandardEngineEvent(
  supabase: SupabaseClient,
  input: {
    type: EngineEventType;
    inquiryId: string;
    actorUserId: string | null;
    timestamp?: string;
    priority?: EngineEventPriority;
    data?: Record<string, unknown>;
    systemMessage?: EngineSystemMessage;
    notifications?: EngineNotification[];
  },
): Promise<{ errors: Array<{ listener: string; error: Error }> }> {
  const ts = input.timestamp ?? new Date().toISOString();
  return emitEngineEvents(supabase, {
    type: input.type,
    inquiryId: input.inquiryId,
    actorUserId: input.actorUserId,
    timestamp: ts,
    priority: input.priority ?? DEFAULT_PRIORITY[input.type],
    payload: {
      data: input.data ?? {},
      systemMessage: input.systemMessage,
      notifications: input.notifications,
    },
  });
}
