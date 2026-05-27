/**
 * Platform HQ — marketing-funnel lead loaders.
 *
 * Reads `public.saas_marketing_signups` (RLS-locked; service-role only)
 * for the Today page's "Recent leads" card and the lead KPI strip.
 *
 * Kept in its own file so `platform-data.ts` stays under the 800-line
 * eslint cap; re-exported from there.
 */

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export type PlatformLeadRow = {
  id: string;
  email: string;
  name: string;
  audience: string;
  rosterSize: string | null;
  tierInterest: "free" | "studio" | "agency" | "network" | null;
  subdomainWanted: string | null;
  status: string;
  claimedByProfileId: string | null;
  provisionedTenantId: string | null;
  claimedAt: string | null;
  createdAt: string;
  createdAtIso: string;
};

export async function loadRecentLeads(limit = 10): Promise<PlatformLeadRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("saas_marketing_signups")
    .select(
      "id, email, name, audience, roster_size, tier_interest, subdomain_wanted, status, claimed_by_profile_id, provisioned_tenant_id, claimed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    logServerError("platform_data.loadRecentLeads", error);
    return [];
  }

  return (data as Array<{
    id: string;
    email: string;
    name: string;
    audience: string;
    roster_size: string | null;
    tier_interest: string | null;
    subdomain_wanted: string | null;
    status: string | null;
    claimed_by_profile_id: string | null;
    provisioned_tenant_id: string | null;
    claimed_at: string | null;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    audience: r.audience,
    rosterSize: r.roster_size,
    tierInterest: (r.tier_interest as PlatformLeadRow["tierInterest"]) ?? null,
    subdomainWanted: r.subdomain_wanted,
    status: r.status ?? "new",
    claimedByProfileId: r.claimed_by_profile_id,
    provisionedTenantId: r.provisioned_tenant_id,
    claimedAt: r.claimed_at,
    createdAt: formatRelativeDate(r.created_at),
    createdAtIso: r.created_at,
  }));
}

export type PlatformLeadStats = {
  total: number;
  last7d: number;
  last30d: number;
  converted: number;
  conversionPct: number;
};

export async function loadLeadStats(): Promise<PlatformLeadStats> {
  const sb = createServiceRoleClient();
  const empty: PlatformLeadStats = { total: 0, last7d: 0, last30d: 0, converted: 0, conversionPct: 0 };
  if (!sb) return empty;

  const now = Date.now();
  const iso7 = new Date(now - 7 * 86400000).toISOString();
  const iso30 = new Date(now - 30 * 86400000).toISOString();

  const [totalRes, last7Res, last30Res, convertedRes] = await Promise.all([
    sb.from("saas_marketing_signups").select("id", { count: "exact", head: true }),
    sb
      .from("saas_marketing_signups")
      .select("id", { count: "exact", head: true })
      .gte("created_at", iso7),
    sb
      .from("saas_marketing_signups")
      .select("id", { count: "exact", head: true })
      .gte("created_at", iso30),
    sb
      .from("saas_marketing_signups")
      .select("id", { count: "exact", head: true })
      .not("provisioned_tenant_id", "is", null),
  ]);

  const total = totalRes.count ?? 0;
  const converted = convertedRes.count ?? 0;
  return {
    total,
    last7d: last7Res.count ?? 0,
    last30d: last30Res.count ?? 0,
    converted,
    conversionPct: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
  };
}
