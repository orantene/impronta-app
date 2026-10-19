import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { scopeToGuestSellableOfferings } from "@/lib/offerings/guest-sellable";
import { logServerError } from "@/lib/server/safe-error";
import { loadOfferingChildren } from "@/lib/talent/offerings-children";
import { stripPublicOfferingFlightFields } from "@/lib/talent/offerings-public-strip";
import { rowToOffering, type TalentOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";
import { hideTestServiceOnPublicSite } from "@/lib/talent/qa-test-service";
import { loadTestServiceScope } from "@/lib/talent/qa-test-service.server";

/** Hard ceiling on rows read for one business; the API pages inside it. */
const BUSINESS_CATALOG_ROW_LIMIT = 500;

/**
 * Every guest-sellable offering of one workspace (tenant). The D-10 filter is in
 * the query (published + approved + public) and applied again by the pure
 * mapper. Options are attached so a "from" price matches the page. Never
 * throws: a failed read is an empty catalog, logged.
 */
export async function loadBusinessCatalogOfferings(
  admin: SupabaseClient,
  tenantId: string,
  locale: string,
): Promise<TalentOffering[]> {
  try {
    const query = scopeToGuestSellableOfferings(
      admin.from("talent_offerings").select("*").eq("tenant_id", tenantId),
    );
    const { data, error } = await query.order("sort_order", { ascending: true }).limit(BUSINESS_CATALOG_ROW_LIMIT);
    if (error) {
      logServerError("public.businessCatalog.load", error);
      return [];
    }
    const loaded = (data ?? []) as TalentOfferingRow[];
    const testScope = await loadTestServiceScope(admin, loaded);
    const rows = loaded.filter((r) => !hideTestServiceOnPublicSite(r, testScope));
    if (rows.length === 0) return [];
    const children = await loadOfferingChildren(admin, rows.map((r) => r.id), { locale });
    return rows.map((r) =>
      stripPublicOfferingFlightFields({ ...rowToOffering(r, locale, []), variants: children.variants.get(r.id) ?? [] }),
    );
  } catch (err) {
    logServerError("public.businessCatalog.load", err);
    return [];
  }
}
