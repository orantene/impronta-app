/**
 * The instant sales stop for one date (TUL-1344): per-date override first, then
 * the series offset ("N minutes before the start"), then the start itself.
 * Null on a malformed start so callers fail closed. Pure.
 *
 * (The purchase action carries the same rule in `dated-purchase.ts`; the two
 * PRs land separately and are folded together once both are in.)
 */
export function resolveSalesCloseAt(a: {
  startsAt: string;
  salesCloseAt?: string | null;
  salesCloseMinutes?: number | null;
}): string | null {
  if (a.salesCloseAt) {
    const t = Date.parse(a.salesCloseAt);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  const start = Date.parse(a.startsAt);
  if (!Number.isFinite(start)) return null;
  const minutes =
    typeof a.salesCloseMinutes === "number" && Number.isFinite(a.salesCloseMinutes) && a.salesCloseMinutes > 0
      ? Math.floor(a.salesCloseMinutes)
      : 0;
  return new Date(start - minutes * 60_000).toISOString();
}
