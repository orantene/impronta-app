import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { loadTalentEarningsWithSupabase } from "@/lib/talent/earnings";
import { earningsByChannel, whereItsSold, type ChannelEarnings, type WhereSoldRow } from "./service-hub-channels";
import { appearingIn, isMissingRelation, soldListingsFromRows, type Appearance } from "./service-hub-channels-rows";

export type ServiceChannels = {
  service: { id: string; title: string; priceCents: number; currency: string };
  rows: WhereSoldRow[];
};

export type ServiceHubChannelsData =
  | {
      ok: true;
      /** False until the held listing / terms migrations are applied. */
      ready: boolean;
      appearances: Appearance[];
      services: ServiceChannels[];
      earnings: ChannelEarnings[];
    }
  | { ok: false };

/**
 * Everything the talent's "Where it's sold / Where you appear / Earnings by
 * channel" page needs. Runs as the talent (RLS lets her read her own listings and
 * terms; workspace names come from the same session). A failed read is
 * `{ ok: false }`, never an empty page that looks like "sold nowhere".
 */
export async function loadServiceHubChannels(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<ServiceHubChannelsData> {
  try {
    const [listingsRes, termsRes, offeringsRes] = await Promise.all([
      supabase
        .from("workspace_service_listings")
        .select("id, tenant_id, offering_id, status, price_mode, margin_bps, price_cents, currency, talent_lowest_cents")
        .eq("talent_profile_id", talentProfileId),
      supabase
        .from("workspace_talent_terms")
        .select("tenant_id, version, work_model, share_kind, share_bps, share_amount_cents, share_currency, status")
        .eq("talent_profile_id", talentProfileId),
      supabase
        .from("talent_offerings")
        .select("id, title, amount_cents, currency")
        .eq("talent_profile_id", talentProfileId)
        .not("amount_cents", "is", null),
    ]);
    if (offeringsRes.error) {
      logServerError("serviceHub.channels.offerings", offeringsRes.error);
      return { ok: false };
    }
    const missing = isMissingRelation(listingsRes.error) || isMissingRelation(termsRes.error);
    if ((listingsRes.error && !isMissingRelation(listingsRes.error)) || (termsRes.error && !isMissingRelation(termsRes.error))) {
      logServerError("serviceHub.channels.read", listingsRes.error ?? termsRes.error);
      return { ok: false };
    }
    const listings = (missing ? [] : (listingsRes.data ?? [])) as Array<Record<string, unknown>>;
    const terms = (missing ? [] : (termsRes.data ?? [])) as Array<Record<string, unknown>>;

    const tenantIds = [...new Set([...listings, ...terms].map((r) => String(r.tenant_id)).filter(Boolean))];
    const names = new Map<string, string>();
    if (tenantIds.length > 0) {
      const { data: agencies, error } = await supabase.from("agencies").select("id, display_name").in("id", tenantIds);
      // Names are cosmetic: a failed read falls back to the id, the numbers stand.
      if (error) logServerError("serviceHub.channels.names", error);
      for (const a of agencies ?? []) names.set(String(a.id), String(a.display_name ?? a.id));
    }

    const services: ServiceChannels[] = ((offeringsRes.data ?? []) as Array<Record<string, unknown>>).map((o) => {
      const currency = String(o.currency ?? "").toUpperCase();
      const priceCents = Number(o.amount_cents);
      return {
        service: { id: String(o.id), title: String(o.title ?? ""), priceCents, currency },
        rows: /^[A-Z]{3}$/.test(currency)
          ? whereItsSold(
              soldListingsFromRows({
                talentPriceCents: priceCents,
                currency,
                listings: listings.filter((l) => String(l.offering_id) === String(o.id)),
                terms,
                tenantNames: names,
              }),
            )
          : [],
      };
    });

    const earnings = earningsByChannel((await loadTalentEarningsWithSupabase(supabase, talentProfileId)).rows);
    return { ok: true, ready: !missing, appearances: appearingIn({ terms, tenantNames: names }), services, earnings };
  } catch (err) {
    logServerError("serviceHub.channels", err);
    return { ok: false };
  }
}
