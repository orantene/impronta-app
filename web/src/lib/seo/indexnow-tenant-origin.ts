/**
 * Public base URL of a tenant for IndexNow pings (TUL-589 S slice, widened by TUL-1777). Returns the tenant's best live
 * domain, or, when it has none, its `/w/<slug>` workspace site on this environment's public root
 * (`resolvePublicRootOrigin`, which is `tulala.digital` in production). The caller appends the page path to the result.
 * Null when the tenant has neither a live domain nor a slug, or is a demo/test workspace (TUL-1931).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLiveDomainStatus } from "@/lib/saas/workspace-live-url";
import { resolvePublicRootOrigin } from "@/lib/brand/public-root-domain";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantHasRealOwnerForIndexNow } from "./indexnow-test-owner";

/**
 * The tenant's best live domain — primary first, then a custom domain over a
 * subdomain — or null if the tenant has no live domain yet (nothing to ping).
 */
export async function resolveTenantPublicOriginForIndexNow(
  sb: SupabaseClient,
  tenantId: string,
  options: { admin?: SupabaseClient | null } = {},
): Promise<string | null> {
  // TUL-1931: no pings for demo/test workspaces (owner is a test account). Fails closed: a lookup error means skip.
  const admin = options.admin !== undefined ? options.admin : createServiceRoleClient();
  if (!(await tenantHasRealOwnerForIndexNow(admin, tenantId))) return null;
  // supabase-read-unchecked-ok: best-effort IndexNow ping; a failed read is
  // the same as "no live domain" (null, nothing to ping).
  const { data } = await sb
    .from("agency_domains")
    .select("hostname, kind, status, is_primary")
    .eq("tenant_id", tenantId);
  const live = (data ?? []).filter((d) => isLiveDomainStatus(d.status));
  if (live.length === 0) {
    // supabase-read-unchecked-ok: best-effort IndexNow ping; a failed read is "nothing to ping".
    const { data: agency } = await sb.from("agencies").select("slug").eq("id", tenantId).maybeSingle<{ slug: string | null }>();
    const slug = agency?.slug?.trim();
    return slug ? `${resolvePublicRootOrigin()}/w/${slug}` : null;
  }
  live.sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "custom" ? -1 : 1;
    return 0;
  });
  return `https://${live[0]!.hostname}`;
}
