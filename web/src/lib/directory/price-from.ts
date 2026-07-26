import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
 * Currency: prices are NOT FX-converted. The minimum is taken per
 * (talent, currency) and the winning row's own currency is returned, so a
 * talent with mixed-currency offerings shows the cheapest row verbatim
 * rather than a cross-currency lie.
 */
export type StartingPrice = { amountCents: number; currency: string };

/**
 * Talents with ANY published, publicly-visible offering — priced or not.
 *
 * Intersected with "has no resolvable price" (i.e. absent from
 * fetchStartingPrices) this identifies the talents who published a service and
 * deliberately withheld the number: "quote on request" / custom pricing. They
 * have MADE a pricing statement, so no tenant or platform default may speak
 * over it — see resolveStartingPrice's consent gate. Telling those apart from
 * talents with no pricing at all is the whole reason this second query exists.
 */
export async function fetchTalentsWithPublishedOfferings(
  supabase: SupabaseClient,
  talentProfileIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (talentProfileIds.length === 0) return out;

  const { data, error } = await supabase
    .from("talent_offerings")
    .select("talent_profile_id")
    .in("talent_profile_id", talentProfileIds)
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"]);

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
};

export async function fetchStartingPrices(
  supabase: SupabaseClient,
  talentProfileIds: string[],
): Promise<Map<string, StartingPrice>> {
  const out = new Map<string, StartingPrice>();
  if (talentProfileIds.length === 0) return out;

  const { data, error } = await supabase
    .from("talent_offerings")
    .select("talent_profile_id, amount_cents, currency")
    .in("talent_profile_id", talentProfileIds)
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"])
    .neq("price_type", "custom")
    .neq("price_display", "quote")
    .gt("amount_cents", 0);

  if (error || !data) return out;

  for (const row of data as OfferingPriceRow[]) {
    if (typeof row.amount_cents !== "number" || row.amount_cents <= 0) continue;
    const prev = out.get(row.talent_profile_id);
    if (!prev || row.amount_cents < prev.amountCents) {
      out.set(row.talent_profile_id, {
        amountCents: row.amount_cents,
        currency: (row.currency ?? "USD").toUpperCase(),
      });
    }
  }
  return out;
}
