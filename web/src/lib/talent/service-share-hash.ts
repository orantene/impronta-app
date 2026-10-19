/**
 * TUL-1270 #13: the stable `#book-<id8>` key a service share link carries. PURE
 * and dependency-free so the hub `#book` bridge can import it client-side.
 */
export const HUB_SERVICE_HASH_PREFIX = "#book-";
const HUB_SERVICE_HASH = /^#book-([0-9a-f]{8})$/;

/** First 8 hex of the offering id, the stable key every share link carries. */
export function offeringId8(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLowerCase();
}

export function hubServiceHash(offeringId: string): string {
  return `${HUB_SERVICE_HASH_PREFIX}${offeringId8(offeringId)}`;
}

/** The id8 a hub hash (or an href ending in one) points at; null otherwise. */
export function parseHubServiceHash(hashOrHref: string): string | null {
  const hash = hashOrHref.includes("#") ? `#${hashOrHref.split("#").pop() ?? ""}` : "";
  const m = HUB_SERVICE_HASH.exec(hash.toLowerCase());
  return m ? m[1]! : null;
}
