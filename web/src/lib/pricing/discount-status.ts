/**
 * discount-status.ts (TUL-1860) · the one lifecycle rule for a code discount.
 * `validateDiscount` (checkout) and the Platform Admin list both call this, so
 * a code the list calls "active" is exactly a code checkout will accept (the
 * redemption cap is a separate, usage-based check and is not part of status).
 */
import type { PricingDiscountRow } from "./pricing-types";

export type DiscountStatus = "scheduled" | "active" | "expired" | "archived";

export function discountStatus(
  d: Pick<PricingDiscountRow, "isActive" | "startsAt" | "endsAt">,
  nowMs: number = Date.now(),
): DiscountStatus {
  if (!d.isActive) return "archived";
  if (d.startsAt && new Date(d.startsAt).getTime() > nowMs) return "scheduled";
  if (d.endsAt && new Date(d.endsAt).getTime() < nowMs) return "expired";
  return "active";
}

/**
 * TUL-1860: the date rules for a code, shared by create and edit.
 * - create: the end date must be in the future (a code that is born expired is a
 *   typo, and Stripe refuses a past `redeem_by` anyway), and start must precede end.
 * - edit: an existing code may already be expired (its end date is frozen), so only
 *   the start/end order is checked.
 */
export const DISCOUNT_WINDOW_ERRORS = {
  endInPast: {
    en: "The end date is in the past. Pick a future date.",
    es: "La fecha de fin ya pasó. Elige una fecha futura.",
  },
  startAfterEnd: {
    en: "The start date must be before the end date.",
    es: "La fecha de inicio debe ser anterior a la fecha de fin.",
  },
} as const;

export function discountWindowError(
  w: { startsAt: string | null | undefined; endsAt: string | null | undefined },
  mode: "create" | "edit",
  nowMs: number = Date.now(),
): keyof typeof DISCOUNT_WINDOW_ERRORS | null {
  const end = w.endsAt ? new Date(w.endsAt).getTime() : null;
  const start = w.startsAt ? new Date(w.startsAt).getTime() : null;
  if (mode === "create" && end !== null && end <= nowMs) return "endInPast";
  if (start !== null && end !== null && start >= end) return "startAfterEnd";
  return null;
}

/** One line carrying both languages, for server errors that have no locale at hand. */
export function bilingualWindowError(key: keyof typeof DISCOUNT_WINDOW_ERRORS): string {
  return `${DISCOUNT_WINDOW_ERRORS[key].en} / ${DISCOUNT_WINDOW_ERRORS[key].es}`;
}
