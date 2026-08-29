import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "./support-from";
import { mapTicketRow, type SupportCallbackPref, type SupportTicketRow } from "./support-types";

type SupportEngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function updateContact(input: {
  ticketId: string;
  contactPhone?: string | null;
  callbackRequested?: boolean;
  callbackPref?: SupportCallbackPref | null;
  actorUserId: string;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const { appendMessage, loadTicketById } = await import("./support-engine");
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const ticket = await loadTicketById(input.ticketId, admin);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  const patch: Record<string, unknown> = {};
  if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone;
  if (input.callbackRequested !== undefined) patch.callback_requested = input.callbackRequested;
  if (input.callbackPref !== undefined) patch.callback_pref = input.callbackPref;

  const { data, error } = await supportFrom(admin, "support_tickets")
    .update(patch)
    .eq("id", ticket.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not update contact." };
  const updated = mapTicketRow(data);
  if (!updated) return { ok: false, error: "Could not update contact." };

  const { error: eventError } = await supportFrom(admin, "support_ticket_events").insert({
    ticket_id: ticket.id,
    tenant_id: ticket.tenantId,
    actor_kind: "requester",
    actor_user_id: input.actorUserId,
    event_type: "contact_updated",
    old_value: null,
    new_value: patch,
  });
  if (eventError) logServerError("support.event.insert", eventError);

  if (updated.callbackRequested && updated.contactPhone) {
    await appendMessage({
      ticketId: ticket.id,
      authorKind: "system",
      authorUserId: null,
      messageKind: "card",
      skipNotify: true,
      body: `Oran will call you at ${updated.contactPhone}.`,
      cardPayload: {
        kind: "callback-confirmed",
        phone: updated.contactPhone,
        pref: updated.callbackPref,
      },
    });
  }
  return { ok: true, data: updated };
}

export async function keepTicketOpen(input: {
  ticketId: string;
  actorUserId: string;
}): Promise<SupportEngineResult<SupportTicketRow>> {
  const { appendMessage } = await import("./support-engine");
  const msg = await appendMessage({
    ticketId: input.ticketId,
    authorKind: "system",
    authorUserId: input.actorUserId,
    body: "Requester asked to keep this ticket open.",
    skipNotify: true,
  });
  if (!msg.ok) return msg;
  const admin = createServiceRoleClient();
  if (admin) {
    const { error: eventError } = await supportFrom(admin, "support_ticket_events").insert({
      ticket_id: input.ticketId,
      tenant_id: msg.data.ticket.tenantId,
      actor_kind: "requester",
      actor_user_id: input.actorUserId,
      event_type: "kept_open",
      old_value: null,
      new_value: null,
    });
    if (eventError) logServerError("support.event.insert", eventError);
  }
  return { ok: true, data: msg.data.ticket };
}
