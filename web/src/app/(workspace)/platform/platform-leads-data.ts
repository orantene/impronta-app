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

/**
 * Orphan paid-tier free workspaces.
 *
 * Surfaces the QA pattern from lead `e783a7d5`: a Studio/Agency/Network
 * paid signup that crashed mid-provisioning leaves an `agencies` row at
 * `plan_tier='free'` with `settings.signup_tier_interest` set to a paid
 * value, but no `workspace_subscriptions` row was ever created (Stripe
 * Checkout never completed). Without surfacing these, the next paid
 * signup for the same user attaches to the orphan and the second
 * payment intent silently collides with the first.
 *
 * READ-ONLY — there's no delete affordance here. Per HARD RULES, the
 * founder reviews each row before any cleanup happens.
 */
export type OrphanPaidFreeWorkspaceRow = {
  tenantId: string;
  slug: string;
  displayName: string;
  signupTierInterest: "studio" | "agency" | "network";
  createdAt: string;
  createdAtIso: string;
  ownerEmail: string | null;
  leadId: string | null;
};

export async function loadOrphanPaidFreeWorkspaces(
  limit = 25,
): Promise<OrphanPaidFreeWorkspaceRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  // Pull all free-tier agencies whose signup intent was paid. Most
  // installations will have very few of these; we further filter
  // client-side for "no workspace_subscriptions row exists" since a
  // server-side join across PostgREST is brittle for the IS NULL case.
  const { data: agencies, error } = await sb
    .from("agencies")
    .select("id, slug, display_name, plan_tier, settings, created_at")
    .eq("plan_tier", "free")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !agencies) {
    logServerError("platform_data.loadOrphanPaidFreeWorkspaces.agencies", error);
    return [];
  }

  const paidIntent = new Set(["studio", "agency", "network"]);
  const ghostCandidates: Array<{
    id: string;
    slug: string;
    display_name: string;
    signup_tier_interest: "studio" | "agency" | "network";
    created_at: string;
  }> = [];

  for (const a of agencies as Array<{
    id: string;
    slug: string;
    display_name: string;
    plan_tier: string;
    settings: Record<string, unknown> | null;
    created_at: string;
  }>) {
    const t = a.settings && typeof a.settings === "object"
      ? String((a.settings as Record<string, unknown>)["signup_tier_interest"] ?? "")
        .trim()
        .toLowerCase()
      : "";
    if (!paidIntent.has(t)) continue;
    ghostCandidates.push({
      id: a.id,
      slug: a.slug,
      display_name: a.display_name,
      signup_tier_interest: t as "studio" | "agency" | "network",
      created_at: a.created_at,
    });
  }

  if (ghostCandidates.length === 0) return [];

  // Filter out anything that actually has a workspace_subscriptions row.
  const tenantIds = ghostCandidates.map((g) => g.id);
  const { data: subs, error: subsErr } = await sb
    .from("workspace_subscriptions")
    .select("tenant_id")
    .in("tenant_id", tenantIds);
  if (subsErr) {
    logServerError("platform_data.loadOrphanPaidFreeWorkspaces.subs", subsErr);
    return [];
  }
  const tenantsWithSub = new Set((subs ?? []).map((r) => (r as { tenant_id: string }).tenant_id));
  const orphans = ghostCandidates.filter((g) => !tenantsWithSub.has(g.id)).slice(0, limit);
  if (orphans.length === 0) return [];

  // Hydrate latest lead (for ID + owner email) per orphan. Most orphans
  // have exactly one lead pointing at them; if multiple, take the most
  // recent (matches the "attach paid lead to orphan" reuse pattern that
  // created this situation).
  const orphanIds = orphans.map((o) => o.id);
  const { data: leads, error: leadsErr } = await sb
    .from("saas_marketing_signups")
    .select("id, email, provisioned_tenant_id, created_at")
    .in("provisioned_tenant_id", orphanIds)
    .order("created_at", { ascending: false });
  if (leadsErr) {
    logServerError("platform_data.loadOrphanPaidFreeWorkspaces.leads", leadsErr);
  }

  const latestByTenant = new Map<string, { id: string; email: string }>();
  for (const l of (leads ?? []) as Array<{
    id: string;
    email: string;
    provisioned_tenant_id: string;
  }>) {
    if (!latestByTenant.has(l.provisioned_tenant_id)) {
      latestByTenant.set(l.provisioned_tenant_id, { id: l.id, email: l.email });
    }
  }

  return orphans.map((o) => {
    const lead = latestByTenant.get(o.id) ?? null;
    return {
      tenantId: o.id,
      slug: o.slug,
      displayName: o.display_name,
      signupTierInterest: o.signup_tier_interest,
      createdAt: formatRelativeDate(o.created_at),
      createdAtIso: o.created_at,
      ownerEmail: lead?.email ?? null,
      leadId: lead?.id ?? null,
    };
  });
}

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
