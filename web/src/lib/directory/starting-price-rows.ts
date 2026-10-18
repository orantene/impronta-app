import { pickHeadlinePrice, type CatalogPriceRow } from "@/lib/directory/headline-price";

/**
 * Pure part of the directory "from" price (no DB, no server-only) so it is
 * unit-testable. See price-from.ts for the tenant-scoping rules.
 *
 * D-10a: an `on_request` service STAYS listed (and bookable) for guests, but
 * its price is withheld, so it never counts as priced and never feeds the
 * headline. Display only; no charge computation reads this.
 */
export type OfferingPriceRow = {
  talent_profile_id: string;
  amount_cents: number | null;
  currency: string | null;
  price_type: string | null;
  is_featured: boolean | null;
  booking_mode: string | null;
  duration_minutes: number | null;
  kind: string | null;
  price_display: string | null;
  visibility?: string | null;
};

export type StartingPrice = { amountCents: number; currency: string; priceType: string };

export type StartingPriceResult = {
  prices: Map<string, StartingPrice>;
  /** Talents with a published timed request/instant offering on this tenant. */
  bookableIds: Set<string>;
};

export function buildStartingPrices(rows: readonly OfferingPriceRow[]): StartingPriceResult {
  const prices = new Map<string, StartingPrice>();
  const bookableIds = new Set<string>();
  const byTalent = new Map<string, CatalogPriceRow[]>();
  for (const row of rows) {
    if (
      row.kind !== "product" &&
      (row.duration_minutes ?? 0) > 0 &&
      // null = inherits the talent default (WSF-B); only inquiry has no slots.
      row.booking_mode !== "inquiry"
    ) {
      bookableIds.add(row.talent_profile_id);
    }
    const amountCents = row.amount_cents;
    const priced =
      row.visibility !== "on_request" &&
      row.price_type !== "custom" &&
      row.price_display !== "quote" &&
      typeof amountCents === "number" &&
      amountCents > 0;
    if (!priced) continue;
    const list = byTalent.get(row.talent_profile_id) ?? [];
    list.push({
      amountCents,
      currency: (row.currency ?? "USD").toUpperCase(),
      priceType: row.price_type ?? "",
      isFeatured: row.is_featured === true,
    });
    byTalent.set(row.talent_profile_id, list);
  }
  for (const [talentId, list] of byTalent) {
    const headline = pickHeadlinePrice(list);
    if (headline) prices.set(talentId, headline);
  }
  return { prices, bookableIds };
}
