/**
 * TUL-232: the per-slot booking deep link, `<site>/?book=<offeringId>&slot=<ISO UTC>#book`.
 * Pure. A past or malformed `slot` keeps the offering (`slotStart: null`); a missing or
 * non-UUID offering id means there is no deep link at all.
 *
 * `#book` is `TALENT_BOOK_HREF` in `contact-channels.ts`; it is repeated here as a literal
 * only so this file stays importable without the builder-node graph that file pulls in.
 */

const BOOK_HASH = "#book";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/;

export type BookingDeepLink = { offeringId: string; slotStart: string | null };

/** A valid ISO-8601 UTC instant strictly after `now`, normalised to `toISOString()`; else null. */
export function parseFutureSlot(raw: string | null | undefined, now: Date): string | null {
  if (!raw || !ISO_UTC.test(raw)) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || ms <= now.getTime()) return null;
  return new Date(ms).toISOString();
}

export function parseBookingDeepLink(
  search: string,
  hash: string,
  now: Date = new Date(),
): BookingDeepLink | null {
  if (hash !== BOOK_HASH) return null;
  const params = new URLSearchParams(search);
  const offeringId = (params.get("book") ?? "").trim();
  if (!UUID.test(offeringId)) return null;
  return { offeringId: offeringId.toLowerCase(), slotStart: parseFutureSlot(params.get("slot"), now) };
}
