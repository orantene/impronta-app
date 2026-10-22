/**
 * TUL-1381: items a workspace sells in a currency its Stripe lane cannot charge (e.g. MXN on the US
 * lane). The same rule as the save gate and the guest-side guard (LANE_CURRENCIES), shown on the
 * Payouts page so the owner fixes the price before a guest hits "could not open the payment page".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCurrencyCode } from "@/lib/inquiry/offer-currency";
import { LANE_CURRENCIES } from "@/lib/payments/seller-currency-guard";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export type LaneMismatchItem = { id: string; title: string; currency: string };
export type LaneMismatch = { lane: "us" | "mx"; items: LaneMismatchItem[] };

type OfferingRow = {
  id: string;
  title: string | null;
  currency: string | null;
  amount_cents: number | null;
  price_display: string | null;
  price_type: string | null;
};

/** Pure: the priced rows whose currency the lane cannot settle. Quote-priced and free rows charge nothing. */
export function itemsOutsideLane(rows: readonly OfferingRow[], lane: "us" | "mx"): LaneMismatchItem[] {
  const out: LaneMismatchItem[] = [];
  for (const r of rows) {
    if (r.price_display === "quote" || r.price_type === "custom") continue;
    if ((r.amount_cents ?? 0) <= 0) continue;
    const currency = normalizeCurrencyCode(r.currency);
    if (!currency || LANE_CURRENCIES[lane].includes(currency)) continue;
    out.push({ id: r.id, title: r.title?.trim() || r.id, currency });
  }
  return out;
}

/** Null when nothing is wrong or the lane / items cannot be read (a warning must never break the page). */
export async function loadLaneMismatch(admin: SupabaseClient, tenantId: string): Promise<LaneMismatch | null> {
  try {
    const { data: agency, error: aErr } = await admin.from("agencies").select("stripe_account_platform").eq("id", tenantId).maybeSingle();
    if (aErr || !agency) return null;
    const lane = (agency as { stripe_account_platform?: string }).stripe_account_platform === "mx" ? "mx" : "us";
    const { data, error } = await tenantScopedQuery(admin, "talent_offerings", tenantId)
      .select("id, title, currency, amount_cents, price_display, price_type")
      .eq("owner_kind", "workspace")
      .eq("status", "published")
      .limit(500);
    if (error) {
      logServerError("payments.laneMismatch.items", error);
      return null;
    }
    const items = itemsOutsideLane((data ?? []) as OfferingRow[], lane);
    return items.length > 0 ? { lane, items } : null;
  } catch (err) {
    logServerError("payments.laneMismatch", err);
    return null;
  }
}
