import "server-only";

import type { ConversationHistoryEntry, HistoryKind } from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type ActionLogRow = {
  actor_user_id: string | null;
  action_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type EventRow = {
  actor_user_id: string | null;
  actor_role: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

// inquiry_events (Track B) event_type -> history kind. Only event types this
// engine can actually see get rendered; everything else is skipped (never
// thrown) so an unrelated event type never breaks the timeline.
const EVENT_KIND: Record<string, HistoryKind> = {
  "offer.sent": "offer_sent",
  "offer.accepted": "offer_accepted",
  "offer.rejected": "offer_declined",
  "payment.requested": "payment_link_created",
  "payment.received": "payment_paid",
  "payment.failed": "payment_failed",
  "payment.expired": "payment_expired",
  "payment.refunded": "payment_refunded",
  "booking.created": "booking_confirmed",
  "booking.cancelled": "booking_cancelled",
  "booking.rescheduled": "booking_rescheduled",
};

/**
 * S4: one ordered timeline merging `inquiry_action_log` (staff actions this
 * lane logs: rename, assign/handover, resolve/reopen, close-lost, merge)
 * with `inquiry_events` (the engine's own record events: offers, payments,
 * bookings). Staff-only reader — `inquiry_action_log`'s own comment says
 * "Never user-visible in Phase 1", which this reads as never shown to the
 * CLIENT; this is a staff workspace surface (D-MSG-3).
 */
export async function loadConversationHistory(
  admin: Admin,
  input: { tenantId: string; inquiryId: string },
): Promise<
  | { ok: true; entries: ConversationHistoryEntry[] }
  | { ok: false; reason: "unavailable" | "not_found" | "wrong_tenant" }
> {
  const { data: inquiry, error } = await admin
    .from("inquiries")
    .select("id, tenant_id")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  if (!inquiry) return { ok: false, reason: "not_found" };
  if ((inquiry as { tenant_id: string }).tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant" };
  }

  const [{ data: actionRows }, { data: eventRows }] = await Promise.all([
    admin
      .from("inquiry_action_log")
      .select("actor_user_id, action_type, result, metadata, created_at")
      .eq("inquiry_id", input.inquiryId)
      .eq("result", "success")
      .order("created_at", { ascending: true }),
    admin
      .from("inquiry_events")
      .select("actor_user_id, actor_role, event_type, payload, created_at")
      .eq("inquiry_id", input.inquiryId)
      .order("created_at", { ascending: true }),
  ]);

  const actorIds = new Set<string>();
  for (const row of (actionRows ?? []) as ActionLogRow[]) if (row.actor_user_id) actorIds.add(row.actor_user_id);
  for (const row of (eventRows ?? []) as EventRow[]) if (row.actor_user_id) actorIds.add(row.actor_user_id);
  const labels = await loadActorLabels(admin, [...actorIds]);

  const entries: ConversationHistoryEntry[] = [];
  for (const row of (actionRows ?? []) as ActionLogRow[]) {
    const entry = renderActionLogEntry(row, labels);
    if (entry) entries.push(entry);
  }
  for (const row of (eventRows ?? []) as EventRow[]) {
    const entry = renderEventEntry(row, labels);
    if (entry) entries.push(entry);
  }

  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return { ok: true, entries };
}

function renderActionLogEntry(row: ActionLogRow, labels: Map<string, string>): ConversationHistoryEntry | null {
  const actorLabel = row.actor_user_id ? (labels.get(row.actor_user_id) ?? "Staff") : "System";
  const meta = row.metadata ?? {};
  switch (row.action_type) {
    case "messaging_rename": {
      const next = typeof meta.new === "string" ? meta.new : "";
      return { at: row.created_at, actorLabel, kind: "rename", text: `${actorLabel} renamed this conversation to "${next}"` };
    }
    case "messaging_assign_owner": {
      const handover = meta.handover === true;
      const ownerLabel = typeof meta.ownerLabel === "string" && meta.ownerLabel ? meta.ownerLabel : "no one";
      const kind: HistoryKind = handover ? "handover" : "assignment";
      const text = handover
        ? `${actorLabel} handed this conversation to ${ownerLabel}`
        : `${actorLabel} assigned this conversation to ${ownerLabel}`;
      return { at: row.created_at, actorLabel, kind, text };
    }
    case "messaging_set_conversation_state": {
      if (meta.state === "resolved") {
        return { at: row.created_at, actorLabel, kind: "resolve", text: `${actorLabel} marked this conversation resolved` };
      }
      if (meta.state === "needs_reply") {
        return { at: row.created_at, actorLabel, kind: "reopen", text: `${actorLabel} reopened this conversation` };
      }
      return null;
    }
    case "messaging_close_lost": {
      const reason = typeof meta.reason === "string" ? meta.reason : "";
      const text = reason ? `${actorLabel} closed this as lost: ${reason}` : `${actorLabel} closed this as lost`;
      return { at: row.created_at, actorLabel, kind: "close_lost", text };
    }
    case "messaging_client_edit": {
      const fields = Array.isArray(meta.fields) ? (meta.fields as unknown[]).filter((f): f is string => typeof f === "string") : [];
      const text = fields.length > 0 ? `${actorLabel} updated the client's ${fields.join(", ")}` : `${actorLabel} updated the client`;
      return { at: row.created_at, actorLabel, kind: "client_edit", text };
    }
    case "messaging_merge": {
      const text =
        meta.direction === "moved_from"
          ? `${actorLabel} merged another conversation into this one`
          : `${actorLabel} merged this conversation into another`;
      return { at: row.created_at, actorLabel, kind: "merge", text };
    }
    default:
      return null;
  }
}

function renderEventEntry(row: EventRow, labels: Map<string, string>): ConversationHistoryEntry | null {
  const kind = EVENT_KIND[row.event_type];
  if (!kind) return null;
  const actorLabel = row.actor_user_id
    ? (labels.get(row.actor_user_id) ?? "Staff")
    : row.actor_role === "client"
      ? "Client"
      : row.actor_role === "talent"
        ? "Talent"
        : "System";
  return { at: row.created_at, actorLabel, kind, text: eventText(kind, actorLabel) };
}

function eventText(kind: HistoryKind, actorLabel: string): string {
  switch (kind) {
    case "offer_sent":
      return `${actorLabel} sent the offer`;
    case "offer_accepted":
      return `${actorLabel} accepted the offer`;
    case "offer_declined":
      return `${actorLabel} declined the offer`;
    case "payment_link_created":
      return `${actorLabel} created a payment link`;
    case "payment_paid":
      return "The payment was received";
    case "payment_failed":
      return "A payment attempt failed";
    case "payment_expired":
      return "The payment link expired";
    case "payment_refunded":
      return "The payment was refunded";
    case "booking_confirmed":
      return "The booking was confirmed";
    case "booking_cancelled":
      return "The booking was cancelled";
    case "booking_rescheduled":
      return "The booking was rescheduled";
    default:
      return actorLabel;
  }
}

async function loadActorLabels(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await admin.from("profiles").select("id, display_name").in("id", ids);
  if (error) return map;
  for (const row of (data ?? []) as { id: string; display_name: string | null }[]) {
    if (row.display_name) map.set(row.id, row.display_name);
  }
  return map;
}
