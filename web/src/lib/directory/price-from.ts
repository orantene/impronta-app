import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildStartingPrices,
  type OfferingPriceRow,
  type StartingPrice,
  type StartingPriceResult,
} from "@/lib/directory/starting-price-rows";

export type { StartingPrice, StartingPriceResult };

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
 * Agency A's negotiated rate on Agency B's public directory. On an AGENCY
 * host the tenant filter is therefore mandatory.
 *
 * Platform / hub host (tenantId null, TUL-791): there is no agency to leak
 * to, and the talent's own profile there already shows every published
 * offering (`loadPublicOfferingsForProfile` skips the tenant filter at null).
 * The card used to return nothing at null scope, so it read only "Consultar"
 * while the profile said "Desde $500". Null scope now reads the same rows the
 * profile reads.
 */
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
  if (talentProfileIds.length === 0) return out;

  let query = supabase
    .from("talent_offerings")
    .select("talent_profile_id")
    .in("talent_profile_id", talentProfileIds);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"])
    // Only rows that WITHHOLD a number on purpose. A published service left
    // with a blank/zero amount is an incomplete draft, not a pricing
    // statement, and must still be eligible for the agency default.
    .or(
      "price_display.eq.quote,price_type.eq.custom,visibility.eq.on_request,amount_cents.is.null,amount_cents.eq.0",
    );

  if (error || !data) return out;
  for (const row of data as { talent_profile_id: string }[]) {
    out.add(row.talent_profile_id);
  }
  return out;
}

export async function fetchStartingPrices(
  supabase: SupabaseClient,
  talentProfileIds: string[],
  tenantId: string | null,
): Promise<StartingPriceResult> {
  const empty: StartingPriceResult = { prices: new Map(), bookableIds: new Set() };
  if (talentProfileIds.length === 0) return empty;

  let query = supabase
    .from("talent_offerings")
    .select(
      "talent_profile_id, amount_cents, currency, price_type, is_featured, booking_mode, duration_minutes, kind, price_display, visibility",
    )
    .in("talent_profile_id", talentProfileIds);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"]);

  if (error || !data) return empty;

  return buildStartingPrices(data as OfferingPriceRow[]);
}
