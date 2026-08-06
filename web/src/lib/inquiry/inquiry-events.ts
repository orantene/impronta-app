import type { SupabaseClient } from "@supabase/supabase-js";
import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";
import { insertSystemMessage, type SystemEventType } from "./inquiry-system-messages";
import { notifyUsers } from "./inquiry-notifications";
import { findCatalogEntries } from "@/lib/notifications/catalog";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { scheduleWorkspaceAuditWith } from "@/lib/audit/workspace-audit";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type EngineEventPriority = "high" | "medium" | "low";

export const ENGINE_EVENT_TYPES = {
  // Inquiry lifecycle / workflow
  INQUIRY_SUBMITTED: "inquiry.submitted",
  INQUIRY_DETAILS_UPDATED: "inquiry.details_updated",
  INQUIRY_MOVED_TO_COORDINATION: "inquiry.moved_to_coordination",
  INQUIRY_PRIORITY_SET: "inquiry.priority_set",
  INQUIRY_FROZEN: "inquiry.frozen",
  INQUIRY_UNFROZEN: "inquiry.unfrozen",
  INQUIRY_ARCHIVED: "inquiry.archived",
  INQUIRY_EXPIRED: "inquiry.expired",
  INQUIRY_CANCELLED: "inquiry.cancelled",
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

  // Requirement groups (Admin Workspace V3, M2.2). Match the event_type strings
  // written by engine_{add,update,remove}_requirement_group /
  // engine_assign_participant_to_group RPCs. All staff-only visibility per
  // spec §3.5(3): internal requirement churn is not shown in participant
  // timelines in Phase 1.
  REQUIREMENT_GROUP_ADDED: "requirement_group_added",
  REQUIREMENT_GROUP_UPDATED: "requirement_group_updated",
  REQUIREMENT_GROUP_REMOVED: "requirement_group_removed",
  PARTICIPANT_GROUP_CHANGED: "participant_group_changed",

  // Roster
  ROSTER_TALENT_INVITED: "roster.talent_invited",
  ROSTER_TALENT_REMOVED: "roster.talent_removed",
  ROSTER_REORDERED: "roster.reordered",
  ROSTER_TALENT_ACCEPTED: "roster.talent_accepted",
  ROSTER_TALENT_DECLINED: "roster.talent_declined",
  ROSTER_TALENT_SWAPPED: "roster.talent_swapped",
  OFFER_INVALIDATED_BY_ROSTER_CHANGE: "offer.invalidated_by_roster_change",

  // Offers + approvals
  OFFER_CREATED: "offer.created",
  OFFER_DRAFT_UPDATED: "offer.draft_updated",
  OFFER_SENT: "offer.sent",
  OFFER_CLIENT_REJECTED: "offer.client_rejected",
  // A2: coordinator reopens a SENT offer back to an editable draft so it can be
  // amended and re-sent (re-seeding fresh approvals). Emitted by
  // reopenOfferForAmendment in inquiry-engine-offers.ts.
  OFFER_REOPENED: "offer.reopened",

  APPROVAL_SUBMITTED: "approval.submitted",
  APPROVAL_REJECTED: "approval.rejected",
  APPROVALS_COMPLETED: "approval.all_complete",

  // Booking
  BOOKING_CREATED: "booking.created",
} as const;

export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[keyof typeof ENGINE_EVENT_TYPES];

export type EngineNotification = { userId: string; title: string; body?: string | null };
export type EngineSystemMessage = {
  threadType: "private" | "group";
  body: string;
  eventType: SystemEventType;
  /**
   * Optional extra metadata stamped onto the system note alongside
   * `system_event_type`. `insertSystemMessage` spreads it after the event-type
   * key. Callers use it to tag a note for later matching — e.g. the guest chip
   * lineup notes carry `{ chip_kind: "talent" }` so the coalescer (P1-7) can
   * recognize and update-in-place a prior lineup note instead of stacking.
   */
  metadata?: Record<string, unknown>;
};

export type EngineEvent = {
  type: EngineEventType;
  inquiryId: string;
  actorUserId: string | null;
  /**
   * Idempotency anchor for this logical event. Shared with the notification
   * dispatcher (becomes part of its `dedupe_key`) and the
   * `failed_engine_effects.event_id` column.
   */
  eventId: string;
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
          metadata?: Record<string, unknown>;
        }
      | undefined;
    if (sm) {
      await insertSystemMessage(supabase, {
        inquiryId: event.inquiryId,
        threadType: sm.threadType,
        eventType: sm.eventType,
        body: sm.body,
        metadata: sm.metadata,
      });
    }
  },
  async (supabase, event) => {
    const notes = event.payload.notifications as
      | Array<{ userId: string; title: string; body?: string | null }>
      | undefined;
    if (notes?.length) {
      // 2026-05-14 — engine_emit_notification now requires p_tenant_id
      // (notifications.tenant_id NOT NULL). Resolve from the inquiry.
      const { data: inq } = await supabase
        .from("inquiries")
        .select("tenant_id")
        .eq("id", event.inquiryId)
        .maybeSingle();
      const tenantId = (inq as { tenant_id?: string } | null)?.tenant_id;
      if (tenantId) {
        await notifyUsers(
          supabase,
          tenantId,
          notes.map((n) => ({ userId: n.userId, title: n.title, body: n.body })),
        );
      }
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
  // Notification engine (spec §2.2) — email + future channels, driven by the
  // code-driven catalog. The inquiry catalog is EMAIL-ONLY, so this never
  // double-sends the in-app bell that listener[1] (`notifyUsers`) already
  // emits. Fire-and-forget and self-contained: it must never throw, or the
  // listener framework would flag the inquiry with `has_failed_effects` for
  // what is a non-critical side-effect. `dispatchEventNotifications` already
  // swallows its own errors; the try/catch is belt-and-suspenders.
  async (supabase, event) => {
    try {
      if (findCatalogEntries(event.type).length === 0) return;
      const { data: inq } = await supabase
        .from("inquiries")
        .select("tenant_id")
        .eq("id", event.inquiryId)
        .maybeSingle();
      const tenantId = (inq as { tenant_id?: string } | null)?.tenant_id ?? null;
      await dispatchEventNotifications({
        type: event.type,
        tenantId,
        inquiryId: event.inquiryId,
        userId: event.actorUserId,
        eventId: event.eventId,
        payload: event.payload.data ?? {},
      });
    } catch (err) {
      logServerError(
        "inquiry-events/notification-dispatch",
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  },
];

/**
 * In-process dispatcher for post-commit effects (Section 2.18).
 * Extend `listeners` with system messages / notifications when wiring.
 *
 * Division of responsibility:
 *   `emitStandardEngineEvent` (and the `emitEngineEvents` primitive below) is
 *   the canonical path for ALL inquiry-engine-*.ts writes to `inquiry_events`.
 *   It writes the event row AND dispatches side-effects (system messages,
 *   push notifications, improntaLog) through the listener chain.
 *
 *   `logInquiryActivity` in `commercial-audit.ts` is a separate, simpler
 *   helper for standalone server-action callers that need a bare event row
 *   with no side-effects. It does NOT delegate here — it writes directly —
 *   but it is never called alongside this function for the same action.
 *   There is no overlapping write path.
 */
export async function emitEngineEvents(
  supabase: SupabaseClient,
  event: EngineEvent,
): Promise<{ errors: Array<{ listener: string; error: Error }> }> {
  const errors: Array<{ listener: string; error: Error }> = [];
  const eventId = event.eventId;

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
        // `payload` carries the ERROR for debugging; the ORIGINAL event needed
        // for a faithful replay lives in the dedicated event_* columns below
        // (migration 20261032000002).
        payload: { message: err.message, stack: err.stack },
        priority: event.priority,
        event_type: event.type,
        event_payload: event.payload,
        event_actor_user_id: event.actorUserId,
      });
      if (insErr) logServerError("inquiry-events/failed_effect_insert", insErr);
      await supabase
        .from("inquiries")
        .update({ has_failed_effects: true })
        .eq("id", event.inquiryId);
      // Workspace Activity Log mirror of the durable `failed_engine_effects`
      // row above. The insert does not carry tenant_id (a DB trigger fills it),
      // so the tenant is resolved in the deferred callback — after the response
      // has flushed, so no caller waits on the lookup. The RETRY sweep is
      // deliberately NOT instrumented; it would multiply one failure by its
      // retry count.
      scheduleWorkspaceAuditWith(async () => {
        const admin = createServiceRoleClient();
        if (!admin) return null;
        const { data } = await admin
          .from("inquiries")
          .select("tenant_id")
          .eq("id", event.inquiryId)
          .maybeSingle();
        const tenantId = (data as { tenant_id?: string | null } | null)?.tenant_id ?? null;
        if (!tenantId) return null;
        return {
          tenantId,
          category: "system" as const,
          action: "system.engine_effect.failed",
          summary: `Automated step ${event.type} failed on an inquiry`,
          targetType: "inquiry",
          targetId: event.inquiryId,
          metadata: { listener: `listener_${i}`, reason: err.message.slice(0, 200) },
        };
      }, "system.engine_effect.failed");
    }
  }

  return { errors };
}

export function registerEngineEventListener(listener: Listener): void {
  listeners.push(listener);
}

/** Number of registered listeners. The retry sweep uses this to bound a
 *  persisted `listener_${i}` index before re-invoking it. */
export function engineListenerCount(): number {
  return listeners.length;
}

/**
 * Re-invoke a SINGLE listener by index. Used exclusively by
 * `retryFailedEngineEffects` to faithfully replay the one listener that failed
 * (e.g. `listener_1` = the bell), WITHOUT re-running the listeners that already
 * succeeded — those would otherwise double-apply (a duplicate system message,
 * a duplicate observability line).
 *
 * Idempotency for the listener that IS replayed is provided downstream:
 *   - listener_1 (notifyUsers) / listener_3 (dispatchEventNotifications) key on
 *     `event.eventId` (the dispatcher's `dedupe_key` has a unique index), so a
 *     re-run after a partial landing is a no-op for the parts that landed.
 *   - listener_0 (system message) / listener_2 (improntaLog) are only recorded
 *     as FAILED when they threw before writing anything, so a replay re-does
 *     work that did not complete.
 *
 * Throws if the listener throws (the caller records the failure + backs off) or
 * if the index is out of range (a listener was removed since the row was
 * logged — treated as un-replayable by the caller).
 */
export async function runEngineListener(
  supabase: SupabaseClient,
  index: number,
  event: EngineEvent,
): Promise<void> {
  const listener = listeners[index];
  if (!listener) {
    throw new Error(`engine listener index out of range: ${index}`);
  }
  await listener(supabase, event);
}

const DEFAULT_PRIORITY: Record<EngineEventType, EngineEventPriority> = {
  [ENGINE_EVENT_TYPES.INQUIRY_SUBMITTED]: "high",
  [ENGINE_EVENT_TYPES.INQUIRY_DETAILS_UPDATED]: "low",
  [ENGINE_EVENT_TYPES.INQUIRY_MOVED_TO_COORDINATION]: "medium",
  [ENGINE_EVENT_TYPES.INQUIRY_PRIORITY_SET]: "low",
  [ENGINE_EVENT_TYPES.INQUIRY_FROZEN]: "high",
  [ENGINE_EVENT_TYPES.INQUIRY_UNFROZEN]: "medium",
  [ENGINE_EVENT_TYPES.INQUIRY_ARCHIVED]: "low",
  [ENGINE_EVENT_TYPES.INQUIRY_EXPIRED]: "medium",
  [ENGINE_EVENT_TYPES.INQUIRY_CANCELLED]: "high",
  [ENGINE_EVENT_TYPES.COORDINATOR_ASSIGNMENT_TIMED_OUT]: "high",
  [ENGINE_EVENT_TYPES.MESSAGE_SENT]: "low",
  [ENGINE_EVENT_TYPES.COORDINATOR_ASSIGNED]: "high",
  [ENGINE_EVENT_TYPES.COORDINATOR_ACCEPTED]: "high",
  [ENGINE_EVENT_TYPES.COORDINATOR_DECLINED]: "high",
  [ENGINE_EVENT_TYPES.SECONDARY_COORDINATOR_ASSIGNED]: "medium",
  [ENGINE_EVENT_TYPES.SECONDARY_COORDINATOR_UNASSIGNED]: "medium",
  [ENGINE_EVENT_TYPES.PRIMARY_COORDINATOR_CHANGED]: "high",
  [ENGINE_EVENT_TYPES.REQUIREMENT_GROUP_ADDED]: "medium",
  [ENGINE_EVENT_TYPES.REQUIREMENT_GROUP_UPDATED]: "low",
  [ENGINE_EVENT_TYPES.REQUIREMENT_GROUP_REMOVED]: "medium",
  [ENGINE_EVENT_TYPES.PARTICIPANT_GROUP_CHANGED]: "low",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_INVITED]: "medium",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_REMOVED]: "medium",
  [ENGINE_EVENT_TYPES.ROSTER_REORDERED]: "low",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_ACCEPTED]: "medium",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_DECLINED]: "medium",
  [ENGINE_EVENT_TYPES.ROSTER_TALENT_SWAPPED]: "medium",
  [ENGINE_EVENT_TYPES.OFFER_INVALIDATED_BY_ROSTER_CHANGE]: "high",
  [ENGINE_EVENT_TYPES.OFFER_CREATED]: "medium",
  [ENGINE_EVENT_TYPES.OFFER_DRAFT_UPDATED]: "low",
  [ENGINE_EVENT_TYPES.OFFER_SENT]: "high",
  [ENGINE_EVENT_TYPES.OFFER_CLIENT_REJECTED]: "high",
  [ENGINE_EVENT_TYPES.OFFER_REOPENED]: "high",
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
    eventId: crypto.randomUUID(),
    timestamp: ts,
    priority: input.priority ?? DEFAULT_PRIORITY[input.type],
    payload: {
      data: input.data ?? {},
      systemMessage: input.systemMessage,
      notifications: input.notifications,
    },
  });
}
