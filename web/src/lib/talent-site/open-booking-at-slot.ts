/**
 * TUL-232: one emitter for "open booking at this slot". The next-free-slot chip, the phone
 * sticky bar and the site deep link all call `openBookingAtSlot`; the sheet reads
 * `detail.slotStart`. Without a `slotStart` the event detail is the SAME object the existing
 * emitters send, so nothing changes for them.
 *
 * The sheet needs a full `OfferingRequestDetail`, which only the page that renders the
 * offering cards has. Those emitters call `registerBookableOffering` so a deep link (which
 * carries only an id) can resolve it.
 */
import { parseBookingDeepLink } from "./booking-deep-link";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

export type BookingEventName =
  | "tulala:offering-instant"
  | "tulala:offering-slot"
  | "tulala:offering-request";

const registry = new Map<string, OfferingRequestDetail>();

export function registerBookableOffering(detail: OfferingRequestDetail): void {
  registry.set(detail.offeringId.toLowerCase(), detail);
}

export function lookupBookableOffering(offeringId: string): OfferingRequestDetail | null {
  return registry.get(offeringId.toLowerCase()) ?? null;
}

/** Event detail: the very same object when there is no slot (byte-identical to today). */
export function bookingEventDetail(
  detail: OfferingRequestDetail,
  slotStart?: string | null,
): OfferingRequestDetail {
  return slotStart ? { ...detail, slotStart } : detail;
}

export function bookingEventNameFor(detail: Pick<OfferingRequestDetail, "intent">): BookingEventName {
  return detail.intent === "instant" ? "tulala:offering-instant" : "tulala:offering-slot";
}

type DispatchTarget = { dispatchEvent: (e: Event) => boolean };

/** Returns false (and dispatches nothing) when the offering detail is unknown. */
export function openBookingAtSlot(
  input: {
    offeringId: string;
    slotStart?: string | null;
    detail?: OfferingRequestDetail | null;
    eventName?: BookingEventName;
  },
  target: DispatchTarget | null = typeof window === "undefined" ? null : window,
): boolean {
  const detail = input.detail ?? lookupBookableOffering(input.offeringId);
  if (!detail || !target) return false;
  target.dispatchEvent(
    new CustomEvent(input.eventName ?? bookingEventNameFor(detail), {
      detail: bookingEventDetail(detail, input.slotStart),
    }),
  );
  return true;
}

export type DeepLinkOutcome = "none" | "opened" | "unresolved";

/**
 * Cold load / pasted `?book=&slot=#book`. "none": no deep link (existing `#book` behaviour
 * applies). "unresolved": a deep link whose offering is not registered yet (the caller retries).
 * `alreadyOpen` stops the retry from resetting a sheet that has opened.
 */
export function openDeepLinkFromLocation(
  loc: { search: string; hash: string },
  opts: { now?: Date; alreadyOpen?: () => boolean; target?: DispatchTarget | null } = {},
): DeepLinkOutcome {
  const link = parseBookingDeepLink(loc.search, loc.hash, opts.now);
  if (!link) return "none";
  if (opts.alreadyOpen?.()) return "opened";
  const ok =
    opts.target === undefined ? openBookingAtSlot(link) : openBookingAtSlot(link, opts.target);
  return ok ? "opened" : "unresolved";
}
