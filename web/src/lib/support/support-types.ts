/**
 * Shared Support Center contracts.
 *
 * Row types live here (not in database.types.ts) because the migrations are
 * not applied in this PR — the integrator regenerates generated types after
 * `db:push`. Callers cast `.from("support_*")` results through these.
 */

export const SUPPORT_TICKET_DRAWER = "support-ticket" as const;

export type SupportTicketStatus = "open" | "resolved" | "closed";
export type SupportWaitingOn = "support" | "requester";
export type SupportSurface = "workspace" | "talent" | "client" | "guest";
export type SupportPriority = "low" | "normal" | "high" | "urgent";
export type SupportHandledBy = "ai" | "human";
export type SupportAuthorKind = "requester" | "agent" | "ai" | "system";
export type SupportMessageKind = "text" | "card" | "system" | "note";
export type SupportCallbackPref = "anytime" | "morning" | "afternoon" | "evening";
export type SupportEscalationReason =
  | "user_requested"
  | "ai_low_confidence"
  | "ai_sentiment"
  | "ai_suggested"
  | "ai_unavailable"
  | "staff_initiated";

export type SupportTicketEventType =
  | "created"
  | "message_sent"
  | "status_changed"
  | "escalated"
  | "assigned"
  | "priority_changed"
  | "category_changed"
  | "contact_updated"
  | "rated"
  | "reopened"
  | "auto_close_warning"
  | "auto_closed"
  | "diagnostic_attached"
  | "insight_generated"
  | "proposed_action_expired"
  | "ai_marked_helpful"
  | "kept_open";

export type SupportTicketRow = {
  id: string;
  ticketNumber: number;
  tenantId: string | null;
  surface: SupportSurface;
  requesterUserId: string | null;
  guestSessionId: string | null;
  talentProfileId: string | null;
  clientProfileId: string | null;
  subject: string;
  category: string | null;
  tags: string[];
  originSurfaceSlug: string | null;
  status: SupportTicketStatus;
  waitingOn: SupportWaitingOn | null;
  priority: SupportPriority;
  handledBy: SupportHandledBy;
  escalatedAt: string | null;
  escalationReason: SupportEscalationReason | null;
  assigneeUserId: string | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  guestLastReadAt: string | null;
  callbackRequested: boolean;
  callbackPref: SupportCallbackPref | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  messageCount: number;
  firstHumanResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenedCount: number;
  satisfactionRating: number | null;
  satisfactionComment: string | null;
  ratedAt: string | null;
  rootCause: string | null;
  longTermFix: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SupportMessageRow = {
  id: string;
  ticketId: string;
  tenantId: string | null;
  authorKind: SupportAuthorKind;
  authorUserId: string | null;
  messageKind: SupportMessageKind;
  body: string;
  cardPayload: Record<string, unknown> | null;
  aiMeta: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type SupportTicketEventRow = {
  id: string;
  ticketId: string;
  tenantId: string | null;
  actorKind: SupportAuthorKind;
  actorUserId: string | null;
  eventType: SupportTicketEventType;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
};

export type SupportTicketSummary = {
  id: string;
  ticketNumber: number;
  subject: string;
  status: SupportTicketStatus;
  waitingOn: SupportWaitingOn | null;
  category: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unread: boolean;
  requesterUserId: string | null;
  surface: SupportSurface;
};

export function supportTicketChannel(ticketId: string): string {
  return `tulala.realtime.support_ticket.${ticketId}`;
}

export function supportTenantChannel(tenantId: string): string {
  return `tulala.realtime.support_tenant.${tenantId}`;
}

export function supportPresenceKey(ticketId: string): string {
  return `support:${ticketId}`;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" ? v : v == null ? null : String(v);
}

function num(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "") return Number(v);
  return 0;
}

export function mapTicketRow(raw: unknown): SupportTicketRow | null {
  const row = asRecord(raw);
  if (!row || typeof row.id !== "string") return null;
  const tags = row.tags;
  return {
    id: row.id,
    ticketNumber: num(row, "ticket_number"),
    tenantId: str(row, "tenant_id"),
    surface: (str(row, "surface") ?? "workspace") as SupportSurface,
    requesterUserId: str(row, "requester_user_id"),
    guestSessionId: str(row, "guest_session_id"),
    talentProfileId: str(row, "talent_profile_id"),
    clientProfileId: str(row, "client_profile_id"),
    subject: str(row, "subject") ?? "",
    category: str(row, "category"),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    originSurfaceSlug: str(row, "origin_surface_slug"),
    status: (str(row, "status") ?? "open") as SupportTicketStatus,
    waitingOn: (str(row, "waiting_on") as SupportWaitingOn | null) ?? null,
    priority: (str(row, "priority") ?? "normal") as SupportPriority,
    handledBy: (str(row, "handled_by") ?? "human") as SupportHandledBy,
    escalatedAt: str(row, "escalated_at"),
    escalationReason: (str(row, "escalation_reason") as SupportEscalationReason | null) ?? null,
    assigneeUserId: str(row, "assignee_user_id"),
    contactEmail: str(row, "contact_email"),
    contactName: str(row, "contact_name"),
    contactPhone: str(row, "contact_phone"),
    guestLastReadAt: str(row, "guest_last_read_at"),
    callbackRequested: row.callback_requested === true,
    callbackPref: (str(row, "callback_pref") as SupportCallbackPref | null) ?? null,
    lastMessageAt: str(row, "last_message_at") ?? new Date().toISOString(),
    lastMessagePreview: str(row, "last_message_preview"),
    messageCount: num(row, "message_count"),
    firstHumanResponseAt: str(row, "first_human_response_at"),
    resolvedAt: str(row, "resolved_at"),
    closedAt: str(row, "closed_at"),
    reopenedCount: num(row, "reopened_count"),
    satisfactionRating:
      typeof row.satisfaction_rating === "number" ? row.satisfaction_rating : null,
    satisfactionComment: str(row, "satisfaction_comment"),
    ratedAt: str(row, "rated_at"),
    rootCause: str(row, "root_cause"),
    longTermFix: str(row, "long_term_fix"),
    metadata: asRecord(row.metadata) ?? {},
    createdAt: str(row, "created_at") ?? new Date().toISOString(),
    updatedAt: str(row, "updated_at") ?? new Date().toISOString(),
  };
}

export function mapMessageRow(raw: unknown): SupportMessageRow | null {
  const row = asRecord(raw);
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    ticketId: str(row, "ticket_id") ?? "",
    tenantId: str(row, "tenant_id"),
    authorKind: (str(row, "author_kind") ?? "system") as SupportAuthorKind,
    authorUserId: str(row, "author_user_id"),
    messageKind: (str(row, "message_kind") ?? "text") as SupportMessageKind,
    body: str(row, "body") ?? "",
    cardPayload: asRecord(row.card_payload),
    aiMeta: asRecord(row.ai_meta),
    metadata: asRecord(row.metadata) ?? {},
    editedAt: str(row, "edited_at"),
    deletedAt: str(row, "deleted_at"),
    createdAt: str(row, "created_at") ?? new Date().toISOString(),
  };
}

export function mapEventRow(raw: unknown): SupportTicketEventRow | null {
  const row = asRecord(raw);
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    ticketId: str(row, "ticket_id") ?? "",
    tenantId: str(row, "tenant_id"),
    actorKind: (str(row, "actor_kind") ?? "system") as SupportAuthorKind,
    actorUserId: str(row, "actor_user_id"),
    eventType: (str(row, "event_type") ?? "created") as SupportTicketEventType,
    oldValue: asRecord(row.old_value),
    newValue: asRecord(row.new_value),
    createdAt: str(row, "created_at") ?? new Date().toISOString(),
  };
}
