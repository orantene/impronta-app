import {
  formatOfferingWhereLabel,
  type OfferingDeliveryWhere,
} from "@/lib/talent/offering-request-detail";

/**
 * TUL-426: where a talent-site booking happens, as one short line for
 * `inquiries.event_location`. Pure: no I/O, so the capture (sheet payload)
 * and the stamp (server) share one rule and one test.
 */

const MAX_LEN = 200;

/** Trim, collapse whitespace, cap the length; empty means "unknown" (null), never "". */
export function cleanEventLocation(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim().slice(0, MAX_LEN).trim();
  return t.length > 0 ? t : null;
}

/** The sheet's capture: the offering's own delivery setting (`attributes.where`) as a label. */
export function serviceLocationLabel(
  where: readonly OfferingDeliveryWhere[] | null | undefined,
  locale?: string | null,
): string | null {
  return cleanEventLocation(formatOfferingWhereLabel(where ?? [], locale));
}

export type ServiceLocationInput = {
  /** The offering's `attributes.where`. Empty = the talent never said. */
  where: readonly OfferingDeliveryWhere[];
  /** Default venue address line, when the workspace has one. */
  venueText?: string | null;
  /** The talent's own home city text. */
  homeCity?: string | null;
  locale?: string | null;
};

/**
 * The service location from settings only. A studio-only service resolves to
 * the venue address, then the talent's city; everything else is the delivery
 * label. No `where` at all means unknown: null, never invented.
 */
export function resolveServiceLocation(input: ServiceLocationInput): string | null {
  if (input.where.length === 0) return null;
  if (input.where.length === 1 && input.where[0] === "studio") {
    return (
      cleanEventLocation(input.venueText) ??
      cleanEventLocation(input.homeCity) ??
      serviceLocationLabel(input.where, input.locale)
    );
  }
  return serviceLocationLabel(input.where, input.locale);
}

/**
 * The line to stamp, first known wins: the booking's own `location_text`, the
 * location the sheet sent, then the offering/talent settings.
 */
export function pickEventLocation(sources: {
  bookingLocationText?: string | null;
  requested?: string | null;
  fromSettings?: string | null;
}): string | null {
  return (
    cleanEventLocation(sources.bookingLocationText) ??
    cleanEventLocation(sources.requested) ??
    cleanEventLocation(sources.fromSettings)
  );
}
