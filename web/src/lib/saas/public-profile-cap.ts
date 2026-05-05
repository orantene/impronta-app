import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDirectoryPage } from "@/lib/directory/fetch-directory-page";
import { resolvePublicRosterDisplayCap } from "@/lib/saas/roster-seat-limit";

type AgencySeatRow = {
  plan_tier: string | null;
  talent_seat_limit: number | null;
};

export async function loadTenantPublicRosterDisplayCap(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("agencies")
    .select("plan_tier, talent_seat_limit")
    .eq("id", tenantId)
    .maybeSingle<AgencySeatRow>();
  if (error) return null;
  return resolvePublicRosterDisplayCap(
    data?.plan_tier ?? null,
    data?.talent_seat_limit ?? null,
  );
}

/**
 * True when the talent id is part of the tenant's publicly visible set under
 * the current plan cap (Free default = 5). Paid plans without cap return true.
 */
export async function isTalentIdWithinTenantPublicDisplayCap(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
): Promise<boolean> {
  const cap = await loadTenantPublicRosterDisplayCap(supabase, tenantId);
  if (cap == null) return true;
  if (cap <= 0) return false;

  const page = await fetchDirectoryPage(supabase, {
    tenantId,
    limit: cap,
    sort: "recommended",
    skipTotalCount: true,
  });
  return page.items.some((item) => item.id === talentProfileId);
}
