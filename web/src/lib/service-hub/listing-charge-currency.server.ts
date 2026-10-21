import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

import { listingChargeCurrency, listingChargeRefusalMessage } from "./listing-charge-currency";
import { sellableListingIds } from "./listing-sellable-batch.server";

/**
 * TUL-1591 (d) [MONEY]: the listing checkout's currency gate. A purchase that sells a hub
 * listing (talent x workspace x service, TUL-1367) passes the listing id; this gate then
 * decides, from the database only, whether the order may be charged and in which currency.
 *
 * Refuses (nothing is charged) when ANY of these holds:
 *   - the listing is not this workspace's, or its service is not in the basket;
 *   - the database does not say the listing is sellable right now;
 *   - the workspace model is missing or unknown (no seller of record);
 *   - the seller of record has no explicit, valid currency;
 *   - the listing's or the service's currency is not the seller's currency;
 *   - the order would be charged in any other currency;
 *   - any read fails or throws.
 * Never a default, never "" and never the other party's currency. Fee math is untouched.
 */

export type HubListingChargeGate = { ok: true; currency: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function refuseHubListingChargeCurrency(
  admin: SupabaseClient,
  input: { tenantId: string; listingId: string; orderCurrency: string; offeringIds: readonly string[]; locale?: string | null },
): Promise<HubListingChargeGate> {
  const refuse = (why: string, reason: Parameters<typeof listingChargeRefusalMessage>[0] = "currency_mismatch"): HubListingChargeGate => {
    logServerError("serviceHub.listingChargeCurrency", why);
    return { ok: false, error: listingChargeRefusalMessage(reason, input.locale) };
  };
  try {
    if (!UUID.test(input.listingId)) return refuse("bad_listing_id");
    const { data: listing, error: lErr } = await tenantScopedQuery(admin, "workspace_service_listings", input.tenantId)
      .select("id, tenant_id, talent_profile_id, offering_id, currency")
      .eq("id", input.listingId)
      .maybeSingle();
    if (lErr) return refuse(lErr.message ?? "listing_read", "unreadable");
    const l = listing as { tenant_id?: string; talent_profile_id?: string; offering_id?: string; currency?: unknown } | null;
    // The second line after the scoped query: the row must be this workspace's.
    if (!l || l.tenant_id !== input.tenantId || !l.talent_profile_id || !l.offering_id) return refuse("listing_not_found");
    if (!input.offeringIds.includes(l.offering_id)) return refuse("listing_service_not_in_basket");

    const sellable = await sellableListingIds(admin, [input.listingId]);
    if (sellable === null) return refuse("sellable_unknown", "unreadable");
    if (!sellable.has(input.listingId)) return refuse("listing_not_sellable");

    const [offering, agency, talent] = await Promise.all([
      admin.from("talent_offerings").select("id, talent_profile_id, currency").eq("id", l.offering_id).maybeSingle(),
      admin.from("agencies").select("work_model, default_currency").eq("id", input.tenantId).maybeSingle(),
      admin.from("talent_profiles").select("id, default_currency").eq("id", l.talent_profile_id).maybeSingle(),
    ]);
    const readErr = offering.error ?? agency.error ?? talent.error;
    if (readErr) return refuse(readErr.message ?? "read", "unreadable");
    const o = offering.data as { talent_profile_id?: string | null; currency?: unknown } | null;
    if (!o || o.talent_profile_id !== l.talent_profile_id) return refuse("service_not_the_talents");
    const a = agency.data as { work_model?: unknown; default_currency?: unknown } | null;
    const t = talent.data as { default_currency?: unknown } | null;

    const verdict = listingChargeCurrency({
      workModel: a?.work_model ?? null,
      workspaceCurrency: a?.default_currency ?? null,
      talentCurrency: t?.default_currency ?? null,
      listingCurrency: l.currency ?? null,
      serviceCurrency: o.currency ?? null,
    });
    if (!verdict.ok) return refuse(verdict.reason, verdict.reason);
    if (verdict.currency !== String(input.orderCurrency ?? "").trim().toUpperCase()) return refuse("order_currency_not_seller_currency", "order_currency");
    return { ok: true, currency: verdict.currency };
  } catch (err) {
    logServerError("serviceHub.listingChargeCurrency.threw", err);
    return { ok: false, error: listingChargeRefusalMessage("unreadable", input.locale) };
  }
}
