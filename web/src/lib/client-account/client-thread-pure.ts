/**
 * TUL-1258: the opened client conversation showed only the title chip and the reply
 * box. Two causes, both fixed here as pure rules (no I/O):
 *
 *  1. The request the client typed is the inquiry's own `message`, not an
 *     `inquiry_messages` row (same fact TUL-955 fixed for the talent inbox), so a
 *     thread whose only rows were cards started empty.
 *  2. A card row (quote, times, basket...) has an empty `body`; it rendered as a
 *     blank box. It now reads its payload `title`/`summary`, and a card with
 *     neither is skipped instead of drawn empty.
 */

import { localizeSystemNote } from "@/lib/inquiry/system-note-i18n";

export type ClientThreadRow = {
  id: string;
  body: string | null;
  created_at: string;
  sender_user_id: string | null;
  message_kind?: string | null;
  card_payload?: Record<string, unknown> | null;
};

export type ClientThreadInquiry = {
  id: string;
  message?: string | null;
  created_at?: string | null;
};

export type ClientThreadMessage = { id: string; body: string; createdAt: string; mine: boolean };

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** The readable text of one row: its body, else a card's own title and summary, else "". */
export function clientThreadBody(row: Pick<ClientThreadRow, "body" | "card_payload">): string {
  const body = (row.body ?? "").trim();
  if (body) return body;
  const p = row.card_payload ?? null;
  if (!p) return "";
  return [text(p.title), text(p.summary)].filter(Boolean).join("\n");
}

export function buildClientThread(
  rows: ReadonlyArray<ClientThreadRow>,
  inquiry: ClientThreadInquiry,
  userId: string,
  locale = "en",
): ClientThreadMessage[] {
  const messages: ClientThreadMessage[] = [];
  for (const r of rows) {
    const raw = clientThreadBody(r);
    if (!raw) continue;
    // TUL-1857: platform notes (no sender) are stored in English; show them in the account language.
    const body = r.sender_user_id ? raw : localizeSystemNote(raw, locale);
    messages.push({ id: r.id, body, createdAt: r.created_at, mine: r.sender_user_id === userId });
  }
  const original = text(inquiry.message);
  if (original && inquiry.created_at && !messages.some((m) => m.mine && m.body === original)) {
    messages.unshift({
      id: `inquiry-request:${inquiry.id}`,
      body: original,
      createdAt: inquiry.created_at,
      mine: true,
    });
  }
  return messages;
}
