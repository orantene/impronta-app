/** Pure URL helper for `?support=<ticketId>` deep links. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `ticketId` is set only for a real uuid. A present but malformed `support`
 * value (a placeholder, a ticket number) sets `invalid` so the panel opens on
 * the Tickets list instead of a thread that can never load.
 */
export function parseSupportDeepLink(search: string): {
  ticketId: string | null;
  nextQuery: string;
  invalid: boolean;
} {
  const hadQ = search.startsWith("?");
  const raw = hadQ ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const value = params.get("support");
  if (!value) {
    return { ticketId: null, nextQuery: search, invalid: false };
  }
  params.delete("support");
  const qs = params.toString();
  const ok = UUID_RE.test(value);
  return { ticketId: ok ? value : null, nextQuery: qs ? `?${qs}` : "", invalid: !ok };
}

export function nextUrlAfterSupportDeepLink(pathname: string, search: string, hash: string): string | null {
  const parsed = parseSupportDeepLink(search);
  if (!parsed.ticketId && !parsed.invalid) return null;
  return `${pathname}${parsed.nextQuery}${hash}`;
}
