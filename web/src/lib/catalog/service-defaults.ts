/**
 * TUL-77 (#36): catalog defaults from what the workspace already says it IS
 * (business family) and where it works (country), instead of one restaurant-
 * shaped default for everybody (Product, USD).
 *
 * Pure, no I/O: the server action reads the family and country and hands them
 * in. Never writes anything.
 */
import type { BusinessFamilyId } from "@/lib/words/business-types";

export type CatalogCreateTypeId = "product" | "service";

const COUNTRY_CURRENCY: Record<string, string> = {
  MX: "MXN",
  MEXICO: "MXN",
  "MÉXICO": "MXN",
  US: "USD",
  USA: "USD",
  "UNITED STATES": "USD",
  "ESTADOS UNIDOS": "USD",
};

/** Currency a new item starts in. `fallback` is today's default (USD). */
export function defaultCurrencyForCountry(country: string | null | undefined, fallback: string): string {
  const key = (country ?? "").trim().toUpperCase();
  return COUNTRY_CURRENCY[key] ?? fallback;
}

/**
 * TUL-1409: the currency most of a workspace's existing items already use, or
 * null when it has none. A new item should not default to a different currency
 * than every sibling just because the address has no mapped country.
 */
export function dominantItemCurrency(currencies: ReadonlyArray<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const raw of currencies) {
    const code = (raw ?? "").trim().toUpperCase();
    if (code.length >= 3) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, n] of counts) {
    if (n > bestCount) {
      best = code;
      bestCount = n;
    }
  }
  return best;
}

/** Families that sell things people take home. Everything else sells a service. */
const PRODUCT_FAMILIES: ReadonlySet<BusinessFamilyId> = new Set<BusinessFamilyId>(["dining", "craft"]);

/** The "What are you selling?" card preselected for this family. */
export function defaultCreateTypeForFamily(family: BusinessFamilyId | null | undefined): CatalogCreateTypeId {
  return family && PRODUCT_FAMILIES.has(family) ? "product" : "service";
}
