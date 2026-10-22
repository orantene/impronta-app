/**
 * priceLines: list price per line. The line engine stays `pricePurchase` (it owns the E5 whole-unit
 * guard, the variant/add-on rules and the cap); this is the one door the display surfaces use.
 */
import { pricePurchase, type PricingResult, type PricingRequestLine } from "@/lib/orders/purchase-pricing";

type Catalog = Parameters<typeof pricePurchase>[1];

export function priceLines(catalog: Catalog, lines: readonly PricingRequestLine[]): PricingResult {
  return pricePurchase(lines, catalog);
}
