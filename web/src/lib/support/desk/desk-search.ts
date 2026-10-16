/**
 * Desk server-side search: input parsing (pure, TUL-624).
 *
 * The queue window holds the latest 200 tickets, so a client-side filter could
 * never find an older one. The search now runs in the database; this module
 * turns the raw box text into one safe, typed term. Nothing it returns can
 * carry PostgREST filter grammar (`,` `(` `)`) or LIKE wildcards (`%` `_` `\`).
 */

export const DESK_SEARCH_PAGE_SIZE = 50;
const MAX_TERM = 80;
const MAX_TICKET_NUMBER = 2_147_483_647;

export type DeskSearchTerm =
  | { kind: "number"; number: number }
  | { kind: "talent"; code: string }
  | { kind: "email"; email: string }
  | { kind: "text"; text: string };

/** Drops everything that is filter grammar or a LIKE wildcard, then caps length. */
function clean(raw: string): string {
  return raw
    .replace(/[,()%_\\*"'`;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TERM);
}

export function parseDeskSearch(raw: string): DeskSearchTerm | null {
  const text = clean(raw.trim().replace(/^#/, ""));
  if (!text) return null;
  if (/^\d{1,10}$/.test(text)) {
    const n = Number(text);
    if (n > 0 && n <= MAX_TICKET_NUMBER) return { kind: "number", number: n };
  }
  if (/^tal-\d{1,12}$/i.test(text)) return { kind: "talent", code: text.toUpperCase() };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { kind: "email", email: text.toLowerCase() };
  return { kind: "text", text };
}

export function deskSearchRange(page: number): { from: number; to: number } {
  const p = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
  const from = p * DESK_SEARCH_PAGE_SIZE;
  return { from, to: from + DESK_SEARCH_PAGE_SIZE - 1 };
}
