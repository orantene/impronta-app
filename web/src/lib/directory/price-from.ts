import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { pickHeadlinePrice, type CatalogPriceRow } from "@/lib/directory/headline-price";

/**
 * Batched "starting from" price per talent for directory cards.
 *
 * Source of truth is the modern services storefront (`talent_offerings`) —
 * NOT the legacy free-text `talent_profiles.starting_from` (unvalidated,
 * unlocalized, un-sortable; deliberately never mapped to cards). The
 * visibility predicate mirrors `loadPublicOfferingsForProfile`
 * (offerings-public.ts): published + approved + publicly visible, with a
 * real numeric price (quote-only and custom-priced offerings never yield a
 * "From $X").
 *
 * Which of a talent's services becomes the headline is decided by
 * pickHeadlinePrice (featured → cheapest bookable unit → cheapest overall),
 * NOT by a naive MIN: the cheapest catalog line is usually an add-on like a
 * casting session or an extra hour, which misrepresents the cost of actually
 * booking the person.
 *
 * Currency: prices are NOT FX-converted. The winning row's own currency is
 * returned verbatim rather than a cross-currency lie.
 *
 * TENANT ISOLATION — load-bearing, do not drop the tenant_id filter.
 * `talent_offerings.tenant_id` means a catalog belongs to ONE agency
 * relationship, and a talent can sit on several rosters at once (the live
 * data already has talent on 5 tenants). Agencies routinely negotiate
 * different rates for the same person, so an unscoped query would publish
 * Agency A's negotiated rate on Agency B's public directory. Without a tenant
 * scope we return nothing rather than guess whose price to show.
 */
export type StartingPrice = { amountCents: number; currency: string };

export type StartingPriceResult = {
  prices: Map<string, StartingPrice>;
  /** Talents with a published timed request/instant offering on this tenant. */
  bookableIds: Set<string>;
};

/**
 * Talents with ANY published, publicly-visible offering — priced or not.
 *
 * Narrowed to rows that WITHHOLD a number deliberately (quote display, custom
 * pricing, or an unset amount). Intersected with "has no resolvable price"
 * (i.e. absent from fetchStartingPrices) this identifies talents who published
 * a service and deliberately withheld the number. They
 * have MADE a pricing statement, so no tenant or platform default may speak
 * over it — see resolveStartingPrice's consent gate. Telling those apart from
 * talents with no pricing at all is the whole reason this second query exists.
 */
export async function fetchTalentsWithPublishedOfferings(
  supabase: SupabaseClient,
  talentProfileIds: string[],
  tenantId: string | null,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (talentProfileIds.length === 0 || !tenantId) return out;

  const { data, error } = await supabase
    .from("talent_offerings")
    .select("talent_profile_id")
    .in("talent_profile_id", talentProfileIds)
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"])
    // Only rows that WITHHOLD a number on purpose. A published service left
    // with a blank/zero amount is an incomplete draft, not a pricing
    // statement, and must still be eligible for the agency default.
    .or(
      "price_display.eq.quote,price_type.eq.custom,amount_cents.is.null,amount_cents.eq.0",
    );

  if (error || !data) return out;
  for (const row of data as { talent_profile_id: string }[]) {
    out.add(row.talent_profile_id);
  }
  return out;
}

type OfferingPriceRow = {
  talent_profile_id: string;
  amount_cents: number | null;
  currency: string | null;
  price_type: string | null;
  is_featured: boolean | null;
  booking_mode: string | null;
  duration_minutes: number | null;
  kind: string | null;
  price_display: string | null;
};

export async function fetchStartingPrices(
  supabase: SupabaseClient,
  talentProfileIds: string[],
  tenantId: string | null,
): Promise<StartingPriceResult> {
  const prices = new Map<string, StartingPrice>();
  const bookableIds = new Set<string>();
  if (talentProfileIds.length === 0 || !tenantId) return { prices, bookableIds };

  const { data, error } = await supabase
    .from("talent_offerings")
    .select(
      "talent_profile_id, amount_cents, currency, price_type, is_featured, booking_mode, duration_minutes, kind, price_display",
    )
    .in("talent_profile_id", talentProfileIds)
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"]);

  if (error || !data) return { prices, bookableIds };

  const byTalent = new Map<string, CatalogPriceRow[]>();
  for (const row of data as OfferingPriceRow[]) {
    if (
      row.kind !== "product" &&
      (row.duration_minutes ?? 0) > 0 &&
      (row.booking_mode === "request" || row.booking_mode === "instant")
    ) {
      bookableIds.add(row.talent_profile_id);
    }
    const priced =
      row.price_type !== "custom" &&
      row.price_display !== "quote" &&
      typeof row.amount_cents === "number" &&
      row.amount_cents > 0;
    if (!priced) continue;
    const list = byTalent.get(row.talent_profile_id) ?? [];
    list.push({
      amountCents: row.amount_cents,
      currency: (row.currency ?? "USD").toUpperCase(),
      priceType: row.price_type ?? "",
      isFeatured: row.is_featured === true,
    });
    byTalent.set(row.talent_profile_id, list);
  }
  for (const [talentId, rows] of byTalent) {
    const headline = pickHeadlinePrice(rows);
    if (headline) prices.set(talentId, headline);
  }
  return { prices, bookableIds };
}
