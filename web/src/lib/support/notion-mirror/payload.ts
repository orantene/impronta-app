/**
 * PII-minimal Notion payload for Support tickets (TUL-45).
 *
 * Allowed fields only: ticket number, status, category, created/updated,
 * short subject, Desk link. Never include contact_*, message bodies, or
 * previews. Notion is a one-way mirror — this module only builds outbound
 * property maps.
 */

export const NOTION_SUBJECT_MAX = 80;

/** Status values allowed into the Notion select (matches support_tickets check). */
export const NOTION_MIRROR_STATUSES = ["open", "resolved", "closed"] as const;

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

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

/** Strip obvious emails/phones from free-text subject before mirroring. */
export function redactSubjectPii(subject: string): string {
  return subject
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(PHONE_RE, "[redacted-phone]")
    .replace(/\s+/g, " ")
    .trim();
}

export function allowListedStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  return (NOTION_MIRROR_STATUSES as readonly string[]).includes(normalized)
    ? normalized
    : "open";
}

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
  const short = trimSubject(redactSubjectPii(subject));
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
  const category = (ticket.category ?? "").trim().slice(0, 100);
  return {
    Ticket: {
      title: [{ type: "text", text: { content: title } }],
    },
    "Ticket number": { number: ticket.ticketNumber },
    Status: { select: { name: allowListedStatus(ticket.status) } },
    Category: {
      rich_text: category
        ? [{ type: "text", text: { content: category } }]
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
