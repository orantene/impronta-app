/**
 * Guest front-door `?order=` cold load — pure helpers.
 *
 * Staff Messages already resolves `/admin/messages?order=`; the guest dock
 * needs the same deep link on a talent site, gated by guest_session ownership.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Accept only a bare uuid (reject empty / injection / short codes). */
export function parseGuestOrderQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const id = raw.trim();
  return UUID_RE.test(id) ? id : null;
}
