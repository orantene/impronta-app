/**
 * "Book again" on a past visit in /account (TUL-65). Pure rules, no I/O.
 *
 * The link goes to the public booking page of the same site (the account area
 * is always on the host that owns the visit, so a relative URL stays on that
 * host and tenant) with `?service=<offering id>`. /book opens on that service; a
 * missing or unknown id changes nothing.
 */

/** Only a completed visit with a known service is worth repeating. */
export function canBookAgain(status: string | null | undefined, offeringId: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "completed" && Boolean(offeringId?.trim());
}

export function bookAgainHref(offeringId: string): string {
  return `/book?service=${encodeURIComponent(offeringId.trim())}`;
}

/**
 * The requested service id, only when it is one of the already loaded, public,
 * bookable offerings (a forged value can only select what a visitor could pick
 * by hand). Empty string means "no pin".
 */
export function pinnedServiceId(offerings: readonly { id: string }[], service: string | string[] | undefined): string {
  const id = typeof service === "string" ? service.trim() : "";
  return id && offerings.some((o) => o.id === id) ? id : "";
}

/**
 * /book serves one business's public offerings only on its own host: a talent
 * site or an agency host. App, hub and marketing hosts have no such page, so
 * Book again would dead-end there and is hidden.
 */
export function hostHasPublicBooking(hostContext: string | null | undefined): boolean {
  return hostContext === "talent_site" || hostContext === "agency";
}
