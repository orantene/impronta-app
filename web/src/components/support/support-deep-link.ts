/** Pure URL helper for `?support=<ticketId>` deep links. */

export function parseSupportDeepLink(search: string): {
  ticketId: string | null;
  nextQuery: string;
} {
  const hadQ = search.startsWith("?");
  const raw = hadQ ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const ticketId = params.get("support");
  if (!ticketId) {
    return { ticketId: null, nextQuery: search };
  }
  params.delete("support");
  const qs = params.toString();
  return { ticketId, nextQuery: qs ? `?${qs}` : "" };
}

export function nextUrlAfterSupportDeepLink(pathname: string, search: string, hash: string): string | null {
  const parsed = parseSupportDeepLink(search);
  if (!parsed.ticketId) return null;
  return `${pathname}${parsed.nextQuery}${hash}`;
}
