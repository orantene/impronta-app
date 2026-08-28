import "server-only";

/**
 * tenant-campaign-promo.ts — a campaign code outlives the link that carried it.
 *
 * THE BUG THIS FIXES: `/get-started?promo=CODE` validated the code, showed
 * "Promo applied", and wrote it to the lead row — and then only ONE thing ever
 * read it back, the checkout that signup opens for a PAID tier. The funnel is
 * free-first, so the ordinary path creates a free workspace with no checkout at
 * all, and the code was orphaned the moment the page rendered. The visitor was
 * told they had claimed two months free; nothing had been claimed, and by the
 * time they upgraded the link was long gone.
 *
 * So the lead row becomes the memory. When an upgrade carries no `?promo=` of
 * its own, we look up the campaign code recorded when this workspace was
 * created and use that. No new column: `saas_marketing_signups` already stores
 * both `promo_code` and the `provisioned_tenant_id` it became.
 *
 * This RESOLVES a code; it does not trust one. `resolveCheckoutDiscount` still
 * re-validates it at checkout — window, active flag, total cap, plan family,
 * per-account limit — so a campaign that has since ended or filled up simply
 * stops applying.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export async function loadTenantCampaignPromo(
  tenantId: string,
): Promise<string | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("saas_marketing_signups")
    .select("promo_code, created_at")
    .eq("provisioned_tenant_id", tenantId)
    .not("promo_code", "is", null)
    // A tenant can in principle match more than one lead row (a re-signup that
    // reused the slug). The FIRST campaign is the promise that was made, so
    // oldest wins rather than newest.
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    logServerError("tenant-campaign-promo.load", error);
    return null;
  }
  const row = data as { promo_code: string | null } | null;
  return row?.promo_code ?? null;
}
