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
import { rememberBookingSheetOpener } from "@/components/public-booking/booking-sheet-opener";
import { catalogDetailIsPurchase } from "@/components/public-booking/catalog-booking-logic";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { parseBookingDeepLink } from "./booking-deep-link";

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

/**
 * Emitter-side guard for the fallback rules: a `slotStart` that is not a real future instant
 * (malformed, stale) is dropped so the sheet opens normally, never at a garbage time. Offsets
 * are accepted (they are valid instants) and normalised to UTC; the URL parser stays strict.
 */
export function sanitizeSlotStart(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > now.getTime() ? new Date(ms).toISOString() : null;
}

type DispatchTarget = { dispatchEvent: (e: Event) => boolean };

/**
 * Returns false (and dispatches nothing) when the offering detail is unknown or is a straight
 * purchase (the sheet skips those), so the caller falls back to its normal entry. An invalid or
 * past `slotStart` still opens the sheet, without a slot.
 */
export function openBookingAtSlot(
  input: {
    offeringId: string;
    slotStart?: string | null;
    detail?: OfferingRequestDetail | null;
    eventName?: BookingEventName;
    now?: Date;
  },
  target: DispatchTarget | null = typeof window === "undefined" ? null : window,
): boolean {
  const detail = input.detail ?? lookupBookableOffering(input.offeringId);
  if (!detail || !target) return false;
  if (catalogDetailIsPurchase(detail)) return false;
  // GRK-097: sticky / next-free-slot taps open via CustomEvent — remember the CTA now.
  if (typeof document !== "undefined") rememberBookingSheetOpener();
  target.dispatchEvent(
    new CustomEvent(input.eventName ?? bookingEventNameFor(detail), {
      detail: bookingEventDetail(detail, sanitizeSlotStart(input.slotStart, input.now)),
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
  // The same clock that parsed the link sanitizes the slot (a pinned `now` must not be ignored here).
  const input = { ...link, now: opts.now };
  const ok =
    opts.target === undefined ? openBookingAtSlot(input) : openBookingAtSlot(input, opts.target);
  return ok ? "opened" : "unresolved";
}
