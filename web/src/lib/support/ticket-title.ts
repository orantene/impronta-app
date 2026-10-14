/**
 * Ticket titles. A ticket must be recognisable in the desk by what the person
 * wrote, never by the channel it arrived through ("Direct message").
 */

const GENERIC_TITLES = new Set([
  "",
  "direct message",
  "contact form",
  "support request",
  "something else",
  "otra cosa",
  "mensaje directo",
]);

export function isGenericTicketTitle(raw: string | null | undefined): boolean {
  const s = (raw ?? "").replace(/^\[guest\]\s*/i, "").trim().toLowerCase();
  return GENERIC_TITLES.has(s);
}

function firstLine(body: string, max: number): string {
  const line = body.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Title stored at creation: the typed subject/topic, else the first message. */
export function deriveTicketSubject(input: {
  subject?: string | null;
  body: string;
  /** True when the subject is a typed title (kept as typed), not a topic pick. */
  typed?: boolean;
}): string {
  const cleaned = (input.subject ?? "").replace(/^\[guest\]\s*/i, "").trim();
  const first = firstLine(input.body, 80);
  if (isGenericTicketTitle(cleaned)) return first || "Support request";
  // A bare topic ("Pricing") is not a title on its own: add the first words.
  if (!input.typed && cleaned.length < 24 && first && !first.toLowerCase().startsWith(cleaned.toLowerCase())) {
    return `${cleaned}: ${first}`.slice(0, 100);
  }
  return cleaned.slice(0, 100);
}

/** Title shown in the desk, repairing rows created before the fix. */
export function displayTicketTitle(ticket: {
  subject: string | null;
  lastMessagePreview?: string | null;
}): string {
  if (isGenericTicketTitle(ticket.subject)) {
    const preview = firstLine(ticket.lastMessagePreview ?? "", 80);
    if (preview) return preview;
    return (ticket.subject ?? "").replace(/^\[guest\]\s*/i, "").trim() || "Support request";
  }
  return (ticket.subject ?? "").replace(/^\[guest\]\s*/i, "").trim();
}

/**
 * The subject the AI may write on its first turn. A title the requester typed
 * is theirs and is never replaced (TUL-657); the AI only fills a ticket that
 * has none or still carries a channel placeholder.
 */
export function aiSuggestedSubjectFor(
  currentSubject: string | null | undefined,
  suggested: string | null | undefined,
): string | null {
  if (!isGenericTicketTitle(currentSubject)) return null;
  const next = (suggested ?? "").trim();
  return next || null;
}
