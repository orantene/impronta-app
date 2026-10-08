/**
 * PII-minimal Notion payload for Support tickets (TUL-45).
 *
 * Allowed fields only: ticket number, status, category, created/updated,
 * short subject, Desk link. Never include contact_*, message bodies, or
 * previews. Notion is a one-way mirror — this module only builds outbound
 * property maps.
 */

export const NOTION_SUBJECT_MAX = 80;

/** Property names expected on the Notion "Support tickets" database. */
export const NOTION_MIRROR_PROPERTY_NAMES = [
  "Ticket",
  "Ticket number",
  "Status",
  "Category",
  "Created",
  "Updated",
  "Desk link",
] as const;

export type NotionMirrorTicketInput = {
  id: string;
  ticketNumber: number;
  subject: string;
  status: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotionMirrorProperties = {
  Ticket: { title: Array<{ type: "text"; text: { content: string } }> };
  "Ticket number": { number: number };
  Status: { select: { name: string } };
  Category: { rich_text: Array<{ type: "text"; text: { content: string } }> };
  Created: { date: { start: string } };
  Updated: { date: { start: string } };
  "Desk link": { url: string };
};

/** Trim + collapse whitespace; hard-cap length for Notion title safety. */
export function trimSubject(subject: string, max = NOTION_SUBJECT_MAX): string {
  const collapsed = subject.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function mirrorTitle(ticketNumber: number, subject: string): string {
  const short = trimSubject(subject);
  return short ? `#${ticketNumber} · ${short}` : `#${ticketNumber}`;
}

export function deskLinkForTicket(ticketId: string): string {
  return `https://support.tulala.digital/desk?ticket=${encodeURIComponent(ticketId)}`;
}

/**
 * Build Notion page properties from a ticket row.
 * Returns only the allow-listed keys — tests assert no PII keys leak.
 */
export function buildNotionMirrorProperties(
  ticket: NotionMirrorTicketInput,
): NotionMirrorProperties {
  const title = mirrorTitle(ticket.ticketNumber, ticket.subject);
  const category = (ticket.category ?? "").trim();
  return {
    Ticket: {
      title: [{ type: "text", text: { content: title } }],
    },
    "Ticket number": { number: ticket.ticketNumber },
    Status: { select: { name: ticket.status } },
    Category: {
      rich_text: category
        ? [{ type: "text", text: { content: category.slice(0, 100) } }]
        : [],
    },
    Created: { date: { start: ticket.createdAt } },
    Updated: { date: { start: ticket.updatedAt } },
    "Desk link": { url: deskLinkForTicket(ticket.id) },
  };
}

/** Keys that must never appear in a mirrored Notion payload. */
export const FORBIDDEN_MIRROR_KEYS = [
  "contact_email",
  "contactEmail",
  "contact_name",
  "contactName",
  "contact_phone",
  "contactPhone",
  "last_message_preview",
  "lastMessagePreview",
  "body",
  "email",
  "phone",
  "requester_user_id",
  "requesterUserId",
] as const;

export function collectPropertyKeys(props: NotionMirrorProperties): string[] {
  return Object.keys(props);
}
