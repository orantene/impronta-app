import type { SupabaseClient } from "@supabase/supabase-js";
import { workspacePathHost } from "@/lib/saas/workspace-public-url";

// NOTE: no `server-only` import here. `agencyRosterProfileUrl` (sync) is
// imported by client components (`MoneyAgencyCards.tsx`,
// `TalentSiteAppearancesPanel.tsx`); only `resolveAgencyPublicOrigins` below
// touches Supabase, and it is called exclusively from server-side loaders.

/**
 * Build the public roster profile URL for a talent on a given agency workspace.
 * Used on the talent "My pages" hub so links open the correct host/path.
 *
 * Always returns an absolute URL pointing at a host where `/t/[profileCode]`
 * actually resolves:
 *   - Agencies with a registered custom domain (`agency_domains`, kind
 *     "custom", ready status, is_primary first) → that domain.
 *   - Agencies with a branded subdomain but no custom domain → the subdomain.
 *   - Everyone else → the canonical path-scoped form on the marketing apex,
 *     `tulala.digital/w/<slug>/t/<code>` (see `workspacePathHost`) — never the
 *     retired flat `/<slug>/t/<code>` shape, which middleware only reaches via
 *     a permanent redirect.
 *
 * Callers that already know the agency's resolved public origin (from
 * {@link resolveAgencyPublicOrigins}) should pass it as `resolvedOrigin`.
 * Callers that have not resolved anything yet fall back to the path form —
 * still correct, just not the shortest URL.
 */
const TULALA_MARKETING_ORIGIN = "https://tulala.digital";

/** Platform hub + self page — always the marketing apex, never a subdomain. */
export function platformSelfProfileUrl(
  profileCode: string | null | undefined,
): string | null {
  const code = profileCode?.trim();
  if (!code) return null;
  return `${TULALA_MARKETING_ORIGIN}/t/${encodeURIComponent(code)}`;
}

export function agencyRosterProfileUrl(
  agencySlug: string,
  profileCode: string | null | undefined,
  isHub = false,
  resolvedOrigin?: string | null,
): string | null {
  const code = profileCode?.trim();
  if (!code) return null;

  if (isHub) {
    return platformSelfProfileUrl(code);
  }

  const path = `/t/${encodeURIComponent(code)}`;

  if (resolvedOrigin) {
    return `${resolvedOrigin}${path}`;
  }

  return `https://${workspacePathHost(agencySlug)}${path}`;
}

const READY_DOMAIN_STATUSES = new Set(["active", "ssl_provisioned", "verified"]);

type AgencyDomainRow = {
  tenant_id: string;
  hostname: string | null;
  kind: string;
  status: string;
  is_primary: boolean | null;
};

/**
 * Resolve each tenant's real public origin from `agency_domains`: the primary
 * active custom domain first, then its (subdomain) host. Same selection rule
 * as `fetchOtherHubsForTalent` in `app/t/[profileCode]/profile-view.tsx` —
 * kept here as the single shared implementation so both call sites agree.
 *
 * Best-effort: any query failure yields an empty map, so callers fall back to
 * the path form rather than throwing.
 */
export async function resolveAgencyPublicOrigins(
  client: SupabaseClient | null,
  tenantIds: string[],
): Promise<Map<string, string>> {
  const originByTenant = new Map<string, string>();
  const ids = Array.from(new Set(tenantIds.filter(Boolean)));
  if (!client || ids.length === 0) return originByTenant;

  const { data } = await client
    .from("agency_domains")
    .select("tenant_id, hostname, kind, status, is_primary")
    .in("tenant_id", ids)
    .in("kind", ["custom", "subdomain"]);

  const rowsByTenant = (data ?? []) as AgencyDomainRow[];
  for (const tid of ids) {
    const rows = rowsByTenant.filter(
      (d) => d.tenant_id === tid && d.hostname && READY_DOMAIN_STATUSES.has(d.status),
    );
    const pick =
      rows.find((d) => d.is_primary && d.kind === "custom") ??
      rows.find((d) => d.is_primary) ??
      rows.find((d) => d.kind === "custom") ??
      rows[0] ??
      null;
    if (pick?.hostname) originByTenant.set(tid, `https://${pick.hostname}`);
  }
  return originByTenant;
}
