/**
 * /book default service and the "no online times" decision (B2/D3).
 *
 * The page used to open on `offerings[0]` whatever its calendar looked like, so
 * a guest landed on a service with no slots and a red "Times are not
 * available" line. Pure, so the rule is testable without a request.
 *
 * `hasOpenTimes` comes from the loader: true/false when it probed that
 * service, undefined when it did not (only the first few are probed, so a page
 * view never costs one availability query per service).
 */

export type BookAvailabilityInput = {
  id: string;
  visibility?: string | null;
  hasOpenTimes?: boolean | null;
};

/** A service the guest cannot pick a time for: request it instead. */
export function isRequestOnlyService(o: BookAvailabilityInput): boolean {
  return o.visibility === "on_request" || o.hasOpenTimes === false;
}

/**
 * First service that actually has times. When none is known to have times,
 * the first service nobody ruled out; when everything is ruled out, the first.
 */
export function pickInitialOfferingId(offerings: readonly BookAvailabilityInput[]): string {
  const withTimes = offerings.find((o) => o.hasOpenTimes === true && o.visibility !== "on_request");
  if (withTimes) return withTimes.id;
  const notRuledOut = offerings.find((o) => !isRequestOnlyService(o));
  return (notRuledOut ?? offerings[0])?.id ?? "";
}

/**
 * Which service /book shows. A requested service (TUL-65 `?service=`, already
 * validated against the loaded list) wins over the default picker until the
 * visitor picks one by hand; a hand pick always wins. An id that is not in the
 * list falls back to the picker's choice, then the first service.
 */
export function resolveSelectedOfferingId(input: {
  offerings: readonly BookAvailabilityInput[];
  requestedId?: string | null;
  userPickedId?: string | null;
}): string {
  const has = (id?: string | null) => !!id && input.offerings.some((o) => o.id === id);
  if (has(input.userPickedId)) return input.userPickedId as string;
  if (has(input.requestedId)) return input.requestedId as string;
  return pickInitialOfferingId(input.offerings);
}

/**
 * TUL-1913: the query string to show after the visitor picks a service on
 * /book. Replaces `service`, keeps every other param (promo, locale, ...).
 */
export function searchWithService(currentSearch: string, serviceId: string): string {
  const params = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  params.set("service", serviceId);
  return `?${params.toString()}`;
}
