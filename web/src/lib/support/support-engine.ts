import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { updateContact, keepTicketOpen } from "./support-engine-contact";
import { adminClient, claimIfUnassigned, insertEvent, loadTicketById } from "./support-engine-db";
import { auditHq, auditTenant, notify } from "./support-engine-emit";
import { supportFrom } from "./support-from";
import {
  mapEventRow,
  mapMessageRow,
  mapTicketRow,
  type SupportAuthorKind,
  type SupportCallbackPref,
  type SupportEscalationReason,
  type SupportHandledBy,
  type SupportMessageKind,
  type SupportMessageRow,
  type SupportPriority,
  type SupportSurface,
  type SupportTicketRow,
  type SupportWaitingOn,
} from "./support-types";

export type SupportEngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export { loadTicketById, claimIfUnassigned };

export type SupportRequesterIdentity =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestSessionId: string; userId?: string | null };

export async function createTicket(input: {
  tenantId: string | null;
  surface: SupportSurface;
  requester: SupportRequesterIdentity;
  talentProfileId?: string | null;
  clientProfileId?: string | null;
  subject?: string;
  body: string;
  category?: string | null;
  originSlug?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  callbackRequested?: boolean;
  callbackPref?: SupportCallbackPref | null;
  handledBy?: SupportHandledBy;
  messageOranDirectly?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<SupportEngineResult<{ ticket: SupportTicketRow; eventId: string }>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };

  const requesterUserId =
    input.requester.kind === "user"
      ? input.requester.userId
      : (input.requester.userId ?? null);
  const guestSessionId =
    input.requester.kind === "guest" ? input.requester.guestSessionId : null;

  const handledBy: SupportHandledBy = input.messageOranDirectly
    ? "human"
    : (input.handledBy ?? "human");
  const now = new Date().toISOString();
  const subject = input.messageOranDirectly
    ? "Direct message"
    : (input.subject ?? "").trim() || (input.body.trim().slice(0, 80) || "Support request");

  const insertRow: Record<string, unknown> = {
    tenant_id: input.tenantId,
    surface: input.surface,
    requester_user_id: requesterUserId,
    guest_session_id: guestSessionId,
    talent_profile_id: input.talentProfileId ?? null,
    client_profile_id: input.clientProfileId ?? null,
    subject,
    category: input.category ?? null,
    origin_surface_slug: input.originSlug ?? null,
    status: "open",
    waiting_on: handledBy === "ai" ? "support" : "support",
    priority: "normal",
    handled_by: handledBy,
    contact_email: input.contactEmail ?? null,
    contact_name: input.contactName ?? null,
    contact_phone: input.contactPhone ?? null,
    callback_requested: input.callbackRequested === true,
    callback_pref: input.callbackPref ?? null,
    last_message_at: now,
    last_message_preview: input.body.trim().slice(0, 140),
    message_count: 0,
    metadata: input.metadata ?? {},
  };
  if (input.messageOranDirectly) {
    insertRow.escalated_at = now;
    insertRow.escalation_reason = "user_requested";
  }

  const { data, error } = await supportFrom(admin, "support_tickets")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) {
    logServerError("support.createTicket", error);
    return { ok: false, error: "Could not create ticket." };
  }
  const ticket = mapTicketRow(data);
  if (!ticket) return { ok: false, error: "Could not create ticket." };

  const first = await appendMessage({
    ticketId: ticket.id,
    authorKind: "requester",
    authorUserId: requesterUserId,
    body: input.body.trim(),
    skipNotify: true,
  });
  if (!first.ok) return first;

  const eventId = await insertEvent(admin, {
    ticketId: ticket.id,
    tenantId: ticket.tenantId,
    actorKind: "requester",
    actorUserId: requesterUserId,
    eventType: "created",
    newValue: { subject: ticket.subject, surface: ticket.surface },
  });

  const createdEventId = eventId ?? crypto.randomUUID();
  notify({
    type: "support.ticket.created",
    tenantId: null,
    eventId: createdEventId,
    payload: {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      tenantId: ticket.tenantId,
      requesterUserId: ticket.requesterUserId,
      contactPhone: ticket.contactPhone,
      surface: ticket.surface,
      deepLink: `/platform/admin/support?ticket=${ticket.id}`,
    },
  });
  if (input.messageOranDirectly) {
    // Own event row: the dispatcher's dedupe key is eventId:user:channel with
    // no entry id, so sharing createdEventId here would suppress whichever of
    // created/escalated dispatches second for the same admin + channel.
    const escalatedEventId = await insertEvent(admin, {
      ticketId: ticket.id,
      tenantId: ticket.tenantId,
      actorKind: "requester",
      actorUserId: requesterUserId,
      eventType: "escalated",
      newValue: { reason: "user_requested" },
    });
    notify({
      type: "support.ticket.escalated",
      tenantId: null,
      eventId: escalatedEventId ?? crypto.randomUUID(),
      payload: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        tenantId: ticket.tenantId,
        requesterUserId: ticket.requesterUserId,
        contactPhone: ticket.contactPhone,
        reason: "user_requested",
        deepLink: `/platform/admin/support?ticket=${ticket.id}`,
      },
    });
  }

  auditTenant(
    ticket.tenantId,
    "support.ticket.created",
    `Opened support ticket #${ticket.ticketNumber}`,
    requesterUserId,
    ticket.id,
  );

  const fresh = (await loadTicketById(ticket.id, admin)) ?? ticket;
  return { ok: true, data: { ticket: fresh, eventId: createdEventId } };
}

export async function appendMessage(input: {
  ticketId: string;
  authorKind: SupportAuthorKind;
  authorUserId: string | null;
  body: string;
  messageKind?: SupportMessageKind;
  cardPayload?: Record<string, unknown> | null;
  aiMeta?: Record<string, unknown> | null;
  skipNotify?: boolean;
  asHq?: boolean;
}): Promise<SupportEngineResult<{ message: SupportMessageRow; ticket: SupportTicketRow }>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };

  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  let working = ticket;
  if (ticket.status === "resolved" && input.authorKind === "requester") {
    const reopened = await reopenTicket({
      ticketId: ticket.id,
      actorUserId: input.authorUserId,
    });
    if (!reopened.ok) return reopened;
    working = reopened.data;
  }

  const { data, error } = await supportFrom(admin, "support_messages")
    .insert({
      ticket_id: working.id,
      tenant_id: working.tenantId,
      author_kind: input.authorKind,
      author_user_id: input.authorUserId,
      message_kind: input.messageKind ?? "text",
      body: input.body,
      card_payload: input.cardPayload ?? null,
      ai_meta: input.aiMeta ?? null,
      metadata: {},
    })
    .select("*")
    .single();
  if (error) {
    logServerError("support.appendMessage", error);
    return { ok: false, error: "Could not send message." };
  }
  const message = mapMessageRow(data);
  if (!message) return { ok: false, error: "Could not send message." };

  if (input.authorKind === "agent" && working.status === "open") {
    await supportFrom(admin, "support_tickets")
      .update({ waiting_on: "requester" })
      .eq("id", working.id)
      .eq("status", "open");
  }
  if (input.authorKind === "requester" && working.status === "open") {
    await supportFrom(admin, "support_tickets")
      .update({ waiting_on: "support" })
      .eq("id", working.id)
      .eq("status", "open");
  }

  const eventId = await insertEvent(admin, {
    ticketId: working.id,
    tenantId: working.tenantId,
    actorKind: input.authorKind,
    actorUserId: input.authorUserId,
    eventType: "message_sent",
    newValue: { messageId: message.id, authorKind: input.authorKind },
  });

  if (!input.skipNotify && input.messageKind !== "note") {
    if (input.authorKind === "agent") {
      const { shouldEmitGuestAgentReply } = await import("./guest-notification-audience");
      if (
        shouldEmitGuestAgentReply({
          surface: working.surface,
          requesterUserId: working.requesterUserId,
          contactEmail: working.contactEmail,
        })
      ) {
        // Distinct event row: sharing eventId with support.message.agent would
        // silently suppress one of the two catalog entries (dedupe has no entry id).
        const guestEventId = await insertEvent(admin, {
          ticketId: working.id,
          tenantId: working.tenantId,
          actorKind: "agent",
          actorUserId: input.authorUserId,
          eventType: "message_sent",
          newValue: { messageId: message.id, audience: "guest" },
        });
        notify({
          type: "support.message.agent.guest",
          tenantId: working.tenantId,
          eventId: guestEventId ?? crypto.randomUUID(),
          payload: {
            ticketId: working.id,
            ticketNumber: working.ticketNumber,
            subject: working.subject,
            preview: input.body.slice(0, 140),
            surface: working.surface,
            contactEmail: working.contactEmail,
            contactName: working.contactName,
            platformFrom: true,
          },
        });
      } else {
        notify({
          type: "support.message.agent",
          tenantId: working.tenantId,
          eventId: eventId ?? crypto.randomUUID(),
          userId: working.requesterUserId,
          payload: {
            ticketId: working.id,
            ticketNumber: working.ticketNumber,
            subject: working.subject,
            preview: input.body.slice(0, 140),
            surface: working.surface,
            platformFrom: true,
          },
        });
      }
    }
    if (input.authorKind === "requester" && working.handledBy === "human") {
      // tenantId MUST be null: this alerts platform admins, and the
      // platformAdmins audience contract resolves platform brand + platform
      // host links only for null-tenant events (a tenant-scoped emit sends
      // /platform/admin/* links on the agency's custom domain and writes
      // in-app rows the HQ feed never reads).
      notify({
        type: "support.ticket.reply",
        tenantId: null,
        eventId: eventId ?? crypto.randomUUID(),
        userId: working.assigneeUserId,
        payload: {
          ticketId: working.id,
          ticketNumber: working.ticketNumber,
          subject: working.subject,
          tenantId: working.tenantId,
          requesterUserId: working.requesterUserId,
          preview: input.body.slice(0, 140),
          assigneeUserId: working.assigneeUserId,
        },
      });
    }
  }

  if (input.asHq && input.authorUserId) {
    await auditHq(input.authorUserId, working.id, "support.ticket.replied");
  }

  const fresh = (await loadTicketById(working.id, admin)) ?? working;
  return { ok: true, data: { message, ticket: fresh } };
}

export async function changeStatus(input: {
  ticketId: string;
  status: "open" | "resolved" | "closed";
  actorUserId: string | null;
  actorKind: SupportAuthorKind;
  expectedStatus?: string;
  asHq?: boolean;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };
  if (input.expectedStatus && ticket.status !== input.expectedStatus) {
    return { ok: false, error: "Ticket status changed. Refresh and try again." };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "open") {
    patch.waiting_on = "support";
    patch.resolved_at = null;
    patch.closed_at = null;
  } else {
    patch.waiting_on = null;
    if (input.status === "resolved") patch.resolved_at = now;
    if (input.status === "closed") patch.closed_at = now;
  }
  const aiSelfServe =
    input.status === "resolved" &&
    input.actorKind === "requester" &&
    ticket.handledBy === "ai";
  if (aiSelfServe) {
    patch.metadata = { ...ticket.metadata, ai_self_serve: true };
  }

  let query = supportFrom(admin, "support_tickets").update(patch).eq("id", ticket.id);
  if (input.expectedStatus) query = query.eq("status", input.expectedStatus);
  const { data, error } = await query.select("*").maybeSingle();
  if (error || !data) {
    logServerError("support.changeStatus", error ?? "no row");
    return { ok: false, error: "Could not update status." };
  }
  const updated = mapTicketRow(data);
  if (!updated) return { ok: false, error: "Could not update status." };

  const eventId = await insertEvent(admin, {
    ticketId: ticket.id,
    tenantId: ticket.tenantId,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
    eventType: "status_changed",
    oldValue: { status: ticket.status },
    newValue: { status: input.status },
  });
  if (aiSelfServe) {
    await insertEvent(admin, {
      ticketId: ticket.id,
      tenantId: ticket.tenantId,
      actorKind: input.actorKind,
      actorUserId: input.actorUserId,
      eventType: "ai_marked_helpful",
      newValue: { status: input.status },
    });
  }

  if (input.status === "resolved") {
    const { shouldEmitGuestAgentReply } = await import("./guest-notification-audience");
    if (
      shouldEmitGuestAgentReply({
        surface: ticket.surface,
        requesterUserId: ticket.requesterUserId,
        contactEmail: ticket.contactEmail,
      })
    ) {
      const guestEventId = await insertEvent(admin, {
        ticketId: ticket.id,
        tenantId: ticket.tenantId,
        actorKind: input.actorKind,
        actorUserId: input.actorUserId,
        eventType: "status_changed",
        newValue: { status: "resolved", audience: "guest" },
      });
      notify({
        type: "support.ticket.resolved.guest",
        tenantId: ticket.tenantId,
        eventId: guestEventId ?? crypto.randomUUID(),
        payload: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          surface: ticket.surface,
          contactEmail: ticket.contactEmail,
          contactName: ticket.contactName,
          platformFrom: true,
        },
      });
    } else {
      notify({
        type: "support.ticket.resolved",
        tenantId: ticket.tenantId,
        eventId: eventId ?? crypto.randomUUID(),
        userId: ticket.requesterUserId,
        payload: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          surface: ticket.surface,
          platformFrom: true,
        },
      });
    }
  }

  auditTenant(
    ticket.tenantId,
    "support.ticket.status",
    `Ticket #${ticket.ticketNumber} marked ${input.status}`,
    input.actorUserId,
    ticket.id,
  );
  if (input.asHq) await auditHq(input.actorUserId, ticket.id, `support.ticket.${input.status}`);
  return { ok: true, data: updated };
}

export async function escalateTicket(input: {
  ticketId: string;
  reason: SupportEscalationReason;
  actorUserId: string | null;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };
  if (ticket.handledBy === "human" && ticket.escalatedAt) {
    return { ok: true, data: ticket };
  }

  const now = new Date().toISOString();
  const { data, error } = await supportFrom(admin, "support_tickets")
    .update({
      handled_by: "human",
      escalated_at: ticket.escalatedAt ?? now,
      escalation_reason: input.reason,
      waiting_on: ticket.status === "open" ? "support" : ticket.waitingOn,
    })
    .eq("id", ticket.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    logServerError("support.escalate", error ?? "no row");
    return { ok: false, error: "Could not escalate." };
  }
  const updated = mapTicketRow(data);
  if (!updated) return { ok: false, error: "Could not escalate." };

  const eventId = await insertEvent(admin, {
    ticketId: ticket.id,
    tenantId: ticket.tenantId,
    actorKind: input.actorUserId ? "requester" : "system",
    actorUserId: input.actorUserId,
    eventType: "escalated",
    oldValue: { handledBy: ticket.handledBy },
    newValue: { reason: input.reason },
  });

  notify({
    type: "support.ticket.escalated",
    tenantId: null,
    eventId: eventId ?? crypto.randomUUID(),
    payload: {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      tenantId: ticket.tenantId,
      requesterUserId: ticket.requesterUserId,
      contactPhone: ticket.contactPhone,
      reason: input.reason,
      deepLink: `/platform/admin/support?ticket=${ticket.id}`,
    },
  });

  auditTenant(
    ticket.tenantId,
    "support.ticket.escalated",
    `Ticket #${ticket.ticketNumber} escalated to a human`,
    input.actorUserId,
    ticket.id,
  );

  const handoff = await appendMessage({
    ticketId: ticket.id,
    authorKind: "system",
    authorUserId: null,
    messageKind: "card",
    skipNotify: true,
    body: "Your ticket is with Oran.",
    cardPayload: {
      kind: "handoff",
      ticketId: ticket.id,
      hasPhone: Boolean(updated.contactPhone),
    },
  });
  return { ok: true, data: handoff.ok ? handoff.data.ticket : updated };
}

export async function assignTicket(input: {
  ticketId: string;
  assigneeUserId: string | null;
  actorUserId: string;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  const { data, error } = await supportFrom(admin, "support_tickets")
    .update({ assignee_user_id: input.assigneeUserId })
    .eq("id", ticket.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    logServerError("support.assign", error ?? "no row");
    return { ok: false, error: "Could not assign." };
  }
  const updated = mapTicketRow(data);
  if (!updated) return { ok: false, error: "Could not assign." };

  await insertEvent(admin, {
    ticketId: ticket.id,
    tenantId: ticket.tenantId,
    actorKind: "agent",
    actorUserId: input.actorUserId,
    eventType: "assigned",
    oldValue: { assigneeUserId: ticket.assigneeUserId },
    newValue: { assigneeUserId: input.assigneeUserId },
  });
  await auditHq(input.actorUserId, ticket.id, "support.ticket.assigned", {
    assigneeUserId: input.assigneeUserId,
  });
  return { ok: true, data: updated };
}

export async function setPriority(input: {
  ticketId: string;
  priority: SupportPriority;
  actorUserId: string;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  const { data, error } = await supportFrom(admin, "support_tickets")
    .update({ priority: input.priority })
    .eq("id", ticket.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not update priority." };
  const updated = mapTicketRow(data);
  if (!updated) return { ok: false, error: "Could not update priority." };

  await insertEvent(admin, {
    ticketId: ticket.id,
    tenantId: ticket.tenantId,
    actorKind: "agent",
    actorUserId: input.actorUserId,
    eventType: "priority_changed",
    oldValue: { priority: ticket.priority },
    newValue: { priority: input.priority },
  });
  await auditHq(input.actorUserId, ticket.id, "support.ticket.priority");
  return { ok: true, data: updated };
}

export async function setCategory(input: {
  ticketId: string;
  category: string | null;
  subject?: string | null;
  actorKind?: SupportAuthorKind;
  actorUserId?: string | null;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  const patch: Record<string, unknown> = { category: input.category };
  if (typeof input.subject === "string" && input.subject.trim()) {
    patch.subject = input.subject.trim();
  }
  const { data, error } = await supportFrom(admin, "support_tickets")
    .update(patch)
    .eq("id", ticket.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not update category." };
  const updated = mapTicketRow(data);
  if (!updated) return { ok: false, error: "Could not update category." };

  await insertEvent(admin, {
    ticketId: ticket.id,
    tenantId: ticket.tenantId,
    actorKind: input.actorKind ?? "agent",
    actorUserId: input.actorUserId ?? null,
    eventType: "category_changed",
    oldValue: { category: ticket.category },
    newValue: { category: input.category },
  });
  return { ok: true, data: updated };
}

export async function rateTicket(input: {
  ticketId: string;
  rating: number;
  comment?: string | null;
  actorUserId: string;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };
  if (ticket.requesterUserId !== input.actorUserId) {
    return { ok: false, error: "Not authorized." };
  }

  const { data, error } = await supportFrom(admin, "support_tickets")
    .update({
      satisfaction_rating: input.rating,
      satisfaction_comment: input.comment ?? null,
      rated_at: new Date().toISOString(),
    })
    .eq("id", ticket.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not save rating." };
  const updated = mapTicketRow(data);
  if (!updated) return { ok: false, error: "Could not save rating." };

  await insertEvent(admin, {
    ticketId: ticket.id,
    tenantId: ticket.tenantId,
    actorKind: "requester",
    actorUserId: input.actorUserId,
    eventType: "rated",
    newValue: { rating: input.rating },
  });
  return { ok: true, data: updated };
}

export async function markRead(input: {
  ticketId: string;
  userId: string;
  lastReadMessageId?: string | null;
}): Promise<SupportEngineResult<true>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { error } = await supportFrom(admin, "support_message_reads").upsert(
    {
      ticket_id: input.ticketId,
      user_id: input.userId,
      last_read_at: new Date().toISOString(),
      last_read_message_id: input.lastReadMessageId ?? null,
    },
    { onConflict: "ticket_id,user_id" },
  );
  if (error) {
    logServerError("support.markRead", error);
    return { ok: false, error: "Could not mark read." };
  }
  return { ok: true, data: true };
}

export async function reopenTicket(input: {
  ticketId: string;
  actorUserId: string | null;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };
  if (ticket.status === "open") return { ok: true, data: ticket };

  const { data, error } = await supportFrom(admin, "support_tickets")
    .update({
      status: "open",
      waiting_on: "support",
      reopened_count: ticket.reopenedCount + 1,
      resolved_at: null,
      closed_at: null,
    })
    .eq("id", ticket.id)
    .in("status", ["resolved", "closed"])
    .select("*")
    .maybeSingle();
  if (error || !data) {
    logServerError("support.reopen", error ?? "no row");
    return { ok: false, error: "Could not reopen ticket." };
  }
  const updated = mapTicketRow(data);
  if (!updated) return { ok: false, error: "Could not reopen ticket." };

  await insertEvent(admin, {
    ticketId: ticket.id,
    tenantId: ticket.tenantId,
    actorKind: "requester",
    actorUserId: input.actorUserId,
    eventType: "reopened",
    oldValue: { status: ticket.status },
    newValue: { status: "open" },
  });
  return { ok: true, data: updated };
}

export const supportEngine = {
  createTicket,
  appendMessage,
  changeStatus,
  escalateTicket,
  assignTicket,
  setPriority,
  setCategory,
  rateTicket,
  markRead,
  reopenTicket,
  updateContact,
  keepTicketOpen,
  claimIfUnassigned,
  loadTicketById,
};
