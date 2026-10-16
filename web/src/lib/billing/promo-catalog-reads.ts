/**
 * lib/billing/promo-catalog-reads.ts (TUL-833)
 *
 * Platform-global product catalog reads for the "Have a code?" preview.
 * product_tiers / product_prices carry no tenant; they live here (not in a
 * server action) like the other catalog readers in lib/pricing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Active tier id for a catalog slug, or null. */
export async function loadActiveTierId(admin: SupabaseClient, tierSlug: string): Promise<string | null> {
  const { data: tier, error } = await admin
    .from("product_tiers")
    .select("id")
    .eq("slug", tierSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (tier as { id?: string } | null)?.id ?? null;
}

/** Canonical (undated) active USD price in cents for a tier + interval column. Throws on query error. */
export async function loadCanonicalUsdPriceCents(
  admin: SupabaseClient,
  tierId: string,
  intervalColumn: string,
): Promise<number | undefined> {
  const { data: prices, error } = await admin
    .from("product_prices")
    .select("unit_amount, valid_from, valid_until")
    .eq("tier_id", tierId)
    .eq("currency", "USD")
    .eq("interval", intervalColumn)
    .eq("is_active", true)
    .is("archived_at", null);
  if (error) throw error;
  const rows = (prices ?? []) as Array<{ unit_amount: number | null; valid_from: string | null; valid_until: string | null }>;
  const canonical = rows.find((p) => p.valid_from === null && p.valid_until === null);
  return canonical?.unit_amount ?? undefined;
}
