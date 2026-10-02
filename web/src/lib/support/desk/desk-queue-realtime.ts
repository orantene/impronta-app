/**
 * Pure queue updaters for HQ realtime → Desk list (keeps shell under max-lines).
 */

import type { HqQueueRow } from "@/lib/support/load-hq";
import type { SupportMessageRow, SupportTicketRow } from "@/lib/support/support-types";

export function applyDeskTicketInsert(
  prev: HqQueueRow[],
  ticketRow: SupportTicketRow,
): HqQueueRow[] {
  if (prev.some((p) => p.ticket.id === ticketRow.id)) {
    return prev.map((p) =>
      p.ticket.id === ticketRow.id ? { ...p, ticket: ticketRow } : p,
    );
  }
  return [
    {
      ticket: ticketRow,
      tenantName: null,
      tenantSlug: null,
      planTier: null,
      requesterName: ticketRow.contactName,
      requesterEmail: ticketRow.contactEmail,
    },
    ...prev,
  ];
}

export function applyDeskTicketUpdate(
  prev: HqQueueRow[],
  ticketRow: SupportTicketRow,
): HqQueueRow[] {
  return prev.map((p) =>
    p.ticket.id === ticketRow.id ? { ...p, ticket: ticketRow } : p,
  );
}

export function applyDeskRequesterMessagePreview(
  prev: HqQueueRow[],
  message: SupportMessageRow,
): HqQueueRow[] {
  if (message.authorKind !== "requester") return prev;
  return prev.map((p) =>
    p.ticket.id === message.ticketId
      ? {
          ...p,
          ticket: {
            ...p.ticket,
            lastMessageAt: message.createdAt,
            lastMessagePreview: message.body.slice(0, 140),
          },
        }
      : p,
  );
}
