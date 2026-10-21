/**
 * Minimal tenant public origin lookup for the IndexNow post hooks (TUL-589,
 * S slice). Deliberately NOT "the" public-origin resolver: it only answers
 * "what host should I ping for this tenant", with no request/host-context
 * fallback chain, no hub-vs-agency distinction, no demo handling. The
 * follow-up card (/w + agency-page hooks, debounce, a real public-origin
 * resolver) replaces this with something load-bearing elsewhere too — until
 * then, this stays private to the IndexNow hooks.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLiveDomainStatus } from "@/lib/saas/workspace-live-url";

/**
 * The tenant's best live domain — primary first, then a custom domain over a
 * subdomain — or null if the tenant has no live domain yet (nothing to ping).
 */
export async function resolveTenantPublicOriginForIndexNow(
  sb: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data } = await sb
    .from("agency_domains")
    .select("hostname, kind, status, is_primary")
    .eq("tenant_id", tenantId);
  const live = (data ?? []).filter((d) => isLiveDomainStatus(d.status));
  if (live.length === 0) return null;
  live.sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "custom" ? -1 : 1;
    return 0;
  });
  return `https://${live[0]!.hostname}`;
}
