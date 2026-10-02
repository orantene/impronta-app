import { isStablecoinPayoutCountry } from "./payout-countries";

/**
 * Countries where we lead with USDC and put the bank option second. Argentina
 * first: local banks are slow and peso-exposed, while USDC arrives in minutes
 * and stays in dollars. Everywhere else both options carry equal weight.
 */
export const USDC_RECOMMENDED_COUNTRIES: ReadonlySet<string> = new Set(["AR"]);

export type UsdcPayoutOffer = {
  /** Show the USDC option at all (hidden when false). */
  eligible: boolean;
  /** Show it first, with a "Recommended" badge, above the bank option. */
  recommended: boolean;
};

/** Pure: ISO-2 country -> how the payout setup should present USDC. */
export function usdcPayoutOffer(iso2: string | null | undefined): UsdcPayoutOffer {
  const eligible = isStablecoinPayoutCountry(iso2);
  const recommended =
    eligible && USDC_RECOMMENDED_COUNTRIES.has((iso2 ?? "").trim().toUpperCase());
  return { eligible, recommended };
}
