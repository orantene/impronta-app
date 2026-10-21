/**
 * TUL-1329: what the Catalog "Website" switch writes. The old switch wrote
 * `public` / `agency_only`, so turning it off and on again turned a
 * price-on-request item into a public one that showed its price. A
 * price-on-request item must never show a price on the public site.
 *
 * Turning off an on_request item also marks it quote-priced, so the price stays
 * hidden even while the visibility value is `agency_only`; turning on a
 * quote-priced item restores `on_request`, never `public`.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";

type SwitchItem = Pick<TalentOffering, "visibility" | "priceDisplay">;

export function websiteSwitchPatch(
  item: SwitchItem,
  next: boolean,
): Partial<Pick<TalentOffering, "visibility" | "priceDisplay">> {
  if (!next) {
    return item.visibility === "on_request"
      ? { visibility: "agency_only", priceDisplay: "quote" }
      : { visibility: "agency_only" };
  }
  return { visibility: item.priceDisplay === "quote" ? "on_request" : "public" };
}
