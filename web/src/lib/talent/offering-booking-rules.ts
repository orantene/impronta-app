/**
 * WSF B2: the narrow patch Website settings writes to one offering. Only
 * booking_mode / deposit_pct / cancellation_hours move, so a save from
 * settings can never undo a Services-editor edit made after settings opened.
 * Validation applies the same rules validateOffering applies to these fields.
 */

import type { OfferingBookingMode, TalentOffering } from "./offerings-types";

export type OfferingBookingRulesPatch = {
  bookingMode: OfferingBookingMode | null;
  depositPct: number | null;
  cancellationHours: number | null;
};

const MODES: readonly string[] = ["instant", "request", "inquiry"];

type RuleInput = Pick<
  TalentOffering,
  "title" | "priceDisplay" | "priceType" | "amountCents" | "reserveMode" | "depositPct" | "status" | "kind"
>;

/**
 * WSF B2 (coordinator ruling): a service that INHERITS an Instant default is
 * held to the instant rules too, with a message naming the fix. Drafts are
 * exempt (a draft may be saved before it has a price; nothing is live).
 * Products never inherit a booking posture.
 */
export function inheritedInstantErrors(o: RuleInput, bookingMode: string | null, defaultPosture: string | null | undefined): string[] {
  if (bookingMode != null || defaultPosture !== "instant") return [];
  if (o.status === "draft" || o.kind === "product") return [];
  const title = o.title || "This service";
  const quoteOnly = o.priceDisplay === "quote" || o.priceType === "custom";
  if (quoteOnly || o.amountCents == null || o.amountCents < 0 || o.priceDisplay !== "exact") {
    return [`“${title}” follows your Instant default. Add an exact price, or set it to Request to book.`];
  }
  if (o.reserveMode === "deposit" && (o.depositPct == null || o.depositPct <= 0 || o.depositPct >= 100)) {
    return [`“${title}” follows your Instant default. Set its deposit percent (1 to 99), or set it to Request to book.`];
  }
  return [];
}

/** Errors for applying `patch` to the latest stored offering. [] = ok. */
export function bookingRulesPatchErrors(
  current: RuleInput,
  patch: OfferingBookingRulesPatch,
  defaultPosture?: string | null,
): string[] {
  const errors: string[] = [];
  const title = current.title || "This service";
  if (patch.bookingMode !== null && !MODES.includes(patch.bookingMode)) errors.push("Pick how clients book.");
  if (patch.depositPct !== null && (!Number.isInteger(patch.depositPct) || patch.depositPct < 0 || patch.depositPct > 100)) {
    errors.push("The deposit must be a whole percent.");
  }
  if (
    patch.cancellationHours !== null &&
    (!Number.isInteger(patch.cancellationHours) || patch.cancellationHours < 0)
  ) {
    errors.push("Cancelling hours must be a whole number.");
  }
  if (patch.bookingMode === "instant") {
    const quoteOnly = current.priceDisplay === "quote" || current.priceType === "custom";
    if (quoteOnly || current.amountCents == null || current.amountCents < 0 || current.priceDisplay !== "exact") {
      errors.push(`Direct booking needs one exact price. Set an amount on “${title}” in Services first.`);
    }
    if (
      current.reserveMode === "deposit" &&
      (patch.depositPct == null || patch.depositPct <= 0 || patch.depositPct >= 100)
    ) {
      errors.push(`Set the deposit percent (1 to 99) for “${title}”.`);
    }
  }
  errors.push(...inheritedInstantErrors({ ...current, depositPct: patch.depositPct }, patch.bookingMode, defaultPosture));
  return errors;
}

/**
 * The DB columns the patch writes, and nothing else. Normalized exactly as
 * offeringToRowPatch does (a deposit is stored only on a deposit reserve).
 */
export function bookingRulesRowPatch(
  current: Pick<TalentOffering, "reserveMode">,
  patch: OfferingBookingRulesPatch,
) {
  return {
    booking_mode: patch.bookingMode,
    deposit_pct: current.reserveMode === "deposit" && patch.depositPct ? Math.round(patch.depositPct) : null,
    cancellation_hours:
      patch.cancellationHours != null && patch.cancellationHours >= 0 ? Math.round(patch.cancellationHours) : null,
  };
}
