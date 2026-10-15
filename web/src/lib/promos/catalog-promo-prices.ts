/**
 * Promo prices for the home-page services catalog cards (design L6: no
 * surface renders a price itself). Computed on the server, handed to the
 * catalog island as plain data. Only offerings a live promo actually changes
 * are in the map, so with no live promo it is empty and the cards render
 * exactly as before.
 */

import { catalogRowMinCents } from "@/components/public-booking/catalog-booking-logic";
import { offeringIsQuote, type TalentOffering } from "@/lib/talent/offerings-types";

import { displayPrice, type DisplayPrice, type DisplayPriceContext } from "./display-price";

export type CatalogPromoPrices = Readonly<Record<string, DisplayPrice>>;

export function catalogPromoPrices(
  offerings: readonly TalentOffering[],
  ctx: DisplayPriceContext | null | undefined,
): CatalogPromoPrices {
  const out: Record<string, DisplayPrice> = {};
  if (!ctx || ctx.promos.length === 0) return out;
  for (const o of offerings) {
    if (o.visibility === "on_request" || offeringIsQuote(o)) continue;
    const min = catalogRowMinCents(o);
    if (min == null || min <= 0) continue;
    const dp = displayPrice({ id: o.id, list_cents: min, currency: o.currency, kind: o.kind === "product" ? "product" : "service" }, ctx);
    if (dp.hasPromo) out[o.id] = dp;
  }
  return out;
}
