import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "./support-from";
import {
  mapMessageRow,
  mapTicketRow,
  type SupportAuthorKind,
  type SupportMessageRow,
  type SupportTicketEventType,
  type SupportTicketRow,
} from "./support-types";

export function adminClient(): SupabaseClient | null {
  return createServiceRoleClient();
}

export async function insertEvent(
  admin: SupabaseClient,
  input: {
    ticketId: string;
    tenantId: string | null;
    actorKind: SupportAuthorKind;
    actorUserId: string | null;
    eventType: SupportTicketEventType;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  },
): Promise<string | null> {
  const { data, error } = await supportFrom(admin, "support_ticket_events")
    .insert({
      ticket_id: input.ticketId,
      tenant_id: input.tenantId,
      actor_kind: input.actorKind,
      actor_user_id: input.actorUserId,
      event_type: input.eventType,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    logServerError("support.event.insert", error ?? "missing id");
    return null;
  }
  return data.id as string;
}

export async function loadTicketById(
  ticketId: string,
  client?: SupabaseClient,
): Promise<SupportTicketRow | null> {
  const db = client ?? adminClient();
  if (!db) return null;
  const { data, error } = await supportFrom(db, "support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) {
    logServerError("support.loadTicket", error);
    return null;
  }
  return mapTicketRow(data);
}

export async function claimIfUnassigned(
  ticketId: string,
  actorUserId: string,
): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  await supportFrom(admin, "support_tickets")
    .update({ assignee_user_id: actorUserId })
    .eq("id", ticketId)
    .is("assignee_user_id", null);
}

/** Prior message with the same client send key (Desk retry / journey 27). */
export async function findMessageByClientSendKey(
  admin: SupabaseClient,
  ticketId: string,
  clientSendKey: string,
): Promise<SupportMessageRow | null> {
  const { data } = await supportFrom(admin, "support_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .filter("metadata->>client_send_key", "eq", clientSendKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapMessageRow(data) : null;
}
