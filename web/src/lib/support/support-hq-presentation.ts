export function surfaceIcon(surface: string): { glyph: string; color: string } {
  if (surface === "workspace") return { glyph: "◆", color: "purple" };
  if (surface === "talent") return { glyph: "★", color: "amber" };
  if (surface === "guest") return { glyph: "○", color: "green" };
  return { glyph: "●", color: "blue" };
}

export function hqQueueSearchHaystack(row: {
  ticket: {
    subject: string | null;
    category: string | null;
    contactEmail: string | null;
    contactName: string | null;
  };
  tenantName: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
}): string {
  return `${row.ticket.subject} ${row.ticket.category ?? ""} ${row.tenantName ?? ""} ${row.requesterName ?? ""} ${row.ticket.contactEmail ?? ""} ${row.ticket.contactName ?? ""} ${row.requesterEmail ?? ""}`.toLowerCase();
}

export function guestHasNoReplyChannel(ticket: {
  surface: string;
  contactEmail: string | null;
  escalatedAt: string | null;
  handledBy: string;
  waitingOn: string | null;
}): boolean {
  if (ticket.surface !== "guest") return false;
  if (ticket.contactEmail) return false;
  return Boolean(
    ticket.escalatedAt || ticket.handledBy === "human" || ticket.waitingOn === "support",
  );
}

export const HQ_GUEST_AUDIENCE_ID = "guest";

/** Queue row mapper: guest tickets have no profile email, only contact_email. */
export function hqQueueRequesterEmail(ticket: {
  contactEmail: string | null;
}): string | null {
  return ticket.contactEmail;
}
