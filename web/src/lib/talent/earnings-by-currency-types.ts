/**
 * Pure types + constants for `TalentEarningsByCurrency`.
 *
 * Lives in its own module (not `earnings-by-currency.ts`, which imports
 * `server-only`) so client components like
 * `components/admin/shell/internal/state/context.tsx` can pull the type,
 * the empty-bundle constant, and the `primaryBundleOrEmpty` helper
 * without dragging the server-side loader into the client bundle.
 *
 * Server code re-imports `TalentEarningsByCurrency` from here through
 * `earnings-by-currency.ts` for convenience.
 */

import {
  EMPTY_TALENT_EARNINGS,
  type TalentEarnings,
} from "@/lib/talent/earnings-types";

export type TalentEarningsByCurrency = {
  /** ISO-4217 code from `talent_profiles.default_currency`. Selected first in tabs. */
  defaultCurrency: string;
  /**
   * Per-currency bundles, sorted with `defaultCurrency` first then by
   * ytdNetCents descending. Empty when the talent has no snapshot rows of
   * any currency.
   */
  byCurrency: TalentEarnings[];
  /** All non-empty currency codes for tab labels. */
  currencies: string[];
};

export const EMPTY_TALENT_EARNINGS_BY_CURRENCY: TalentEarningsByCurrency = {
  defaultCurrency: "EUR",
  byCurrency: [],
  currencies: [],
};

/**
 * Convenience helper: extract the primary-currency `TalentEarnings` bundle
 * from a `TalentEarningsByCurrency` result. Used by the bridge to keep
 * backward-compat consumers working without changes.
 *
 * When `byCurrency` is empty (no snapshot rows yet), returns an empty bundle
 * stamped with the talent's `defaultCurrency` rather than the literal EUR —
 * so a Mexico-based talent with no earnings yet sees "MX$0", not "€0", and
 * the "before" reads in the same currency the first booking will pay in.
 */
export function primaryBundleOrEmpty(
  earningsByCurrency: TalentEarningsByCurrency,
): TalentEarnings {
  const primary = earningsByCurrency.byCurrency[0];
  if (primary) return primary;
  return {
    ...EMPTY_TALENT_EARNINGS,
    totals: {
      ...EMPTY_TALENT_EARNINGS.totals,
      currency: (earningsByCurrency.defaultCurrency || "EUR").toUpperCase(),
    },
  };
}
