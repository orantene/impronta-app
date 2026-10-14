import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { insertEvent, loadTicketById } from "./support-engine-db";
import { supportFrom } from "./support-from";
import {
  mapTicketRow,
  type SupportAuthorKind,
  type SupportTicketEventType,
  type SupportTicketRow,
} from "./support-types";

export type SupportEventInput = {
  ticketId: string;
  tenantId: string | null;
  actorKind: SupportAuthorKind;
  actorUserId: string | null;
  eventType: SupportTicketEventType;
  newValue?: Record<string, unknown> | null;
};

/**
 * One multi-row insert for several ticket events (one round trip instead of
 * N). Returns ids aligned with `rows`; null where the insert failed, matching
 * insertEvent's contract. Ids are matched by event_type, so rows must carry
 * distinct event types.
 */
export async function insertEvents(
  admin: SupabaseClient,
  rows: SupportEventInput[],
): Promise<(string | null)[]> {
  const { data, error } = await supportFrom(admin, "support_ticket_events")
    .insert(
      rows.map((r) => ({
        ticket_id: r.ticketId,
        tenant_id: r.tenantId,
        actor_kind: r.actorKind,
        actor_user_id: r.actorUserId,
        event_type: r.eventType,
        old_value: null,
        new_value: r.newValue ?? null,
      })),
    )
    .select("id, event_type");
  const returned = (data ?? []) as { id?: string; event_type?: string }[];
  if (error || returned.length === 0) {
    logServerError("support.event.insert", error ?? "missing id");
    return rows.map(() => null);
  }
  return rows.map((r) => returned.find((d) => d.event_type === r.eventType)?.id ?? null);
}

/**
 * Post-message bookkeeping for appendMessage: the waiting_on flip and the
 * message_sent event are independent, so they run in parallel. The update's
 * `.select()` returns the ticket row after the support_messages trigger ran,
 * so the trailing reload is only needed when no update applied.
 */
export async function finishAppend(
  admin: SupabaseClient,
  working: SupportTicketRow,
  authorKind: SupportAuthorKind,
  event: SupportEventInput,
): Promise<{ eventId: string | null; ticket: SupportTicketRow }> {
  const waitingOn =
    working.status !== "open"
      ? null
      : authorKind === "agent"
        ? "requester"
        : authorKind === "requester"
          ? "support"
          : null;
  const updated = waitingOn
    ? supportFrom(admin, "support_tickets")
        .update({ waiting_on: waitingOn })
        .eq("id", working.id)
        .eq("status", "open")
        .select("*")
        .maybeSingle()
        .then((res: { data: unknown }) => mapTicketRow(res.data ?? null))
    : Promise.resolve(null);
  const [row, eventId] = await Promise.all([updated, insertEvent(admin, event)]);
  const ticket = row ?? (await loadTicketById(working.id, admin)) ?? working;
  return { eventId, ticket };
}
