/**
 * "Book again" on a past visit in /account (TUL-65). Pure rules, no I/O.
 *
 * The link goes to the public booking page of the same site (the account area
 * is always on the host that owns the visit, so a relative URL stays on that
 * host and tenant) with `?service=<offering id>`. /book moves that service to
 * the front of its list; a missing or unknown id changes nothing.
 */

/** Only a completed visit with a known service is worth repeating. */
export function canBookAgain(status: string | null | undefined, offeringId: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "completed" && Boolean(offeringId?.trim());
}

export function bookAgainHref(offeringId: string): string {
  return `/book?service=${encodeURIComponent(offeringId.trim())}`;
}

/**
 * Put the requested service first. The id is matched against the already
 * loaded, public, bookable offerings, so a forged value can only select
 * something the visitor could pick by hand.
 */
export function serviceFirst<T extends { id: string }>(offerings: readonly T[], service: string | string[] | undefined): T[] {
  const id = typeof service === "string" ? service.trim() : "";
  const hit = id ? offerings.find((o) => o.id === id) : undefined;
  return hit ? [hit, ...offerings.filter((o) => o !== hit)] : [...offerings];
}
