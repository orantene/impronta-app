/**
 * Platform HQ data loaders.
 *
 * All queries run with the **service-role client** to bypass tenant-scoped
 * RLS. These functions are intentionally server-only and must NEVER be
 * imported from client components.
 *
 * Returns safe shapes — never raw Supabase types. When a query fails it
 * logs and returns empty/null so pages degrade gracefully.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlatformTenantRow = {
  id: string;
  name: string;
  slug: string;
  entityType: "agency" | "hub" | string;
  plan: string;
  seats: number | null;
  talentCount: number;
  status: string;
  createdAt: string;
};

export type PlatformUserRow = {
  id: string;
  displayName: string;
  email: string;
  appRole: string | null;
  accountStatus: string | null;
  tenantCount: number;
  primaryTenant: string | null;
  isTalent: boolean;
  createdAt: string;
};

export type PlatformStats = {
  totalTenants: number;
  totalUsers: number;
  activeTenants: number;
  totalTalent: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
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

// ─── Tenants ──────────────────────────────────────────────────────────────────

export async function loadPlatformTenants(): Promise<PlatformTenantRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("agencies")
    .select(`
      id,
      display_name,
      slug,
      entity_type,
      plan_tier,
      talent_seat_limit,
      status,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    console.error("[platform-data] loadPlatformTenants:", error);
    return [];
  }

  // Fetch talent counts in one query
  const ids = data.map((r: { id: string }) => r.id);
  let talentCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: rosterData } = await sb
      .from("agency_talent_roster")
      .select("tenant_id")
      .in("tenant_id", ids)
      .neq("status", "removed");

    if (rosterData) {
      for (const row of rosterData as Array<{ tenant_id: string }>) {
        talentCounts[row.tenant_id] = (talentCounts[row.tenant_id] ?? 0) + 1;
      }
    }
  }

  return data.map((r: {
    id: string;
    display_name: string;
    slug: string;
    entity_type: string | null;
    plan_tier: string | null;
    talent_seat_limit: number | null;
    status: string | null;
    created_at: string | null;
  }) => ({
    id: r.id,
    name: r.display_name ?? r.slug,
    slug: r.slug,
    entityType: r.entity_type ?? "agency",
    plan: r.plan_tier ?? "free",
    seats: r.talent_seat_limit,
    talentCount: talentCounts[r.id] ?? 0,
    status: r.status ?? "active",
    createdAt: formatDate(r.created_at),
  }));
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function loadPlatformUsers(): Promise<PlatformUserRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  // Profiles table has the app metadata we need
  const { data, error } = await sb
    .from("profiles")
    .select(`
      id,
      display_name,
      app_role,
      account_status,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    console.error("[platform-data] loadPlatformUsers:", error);
    return [];
  }

  // Fetch emails via auth admin API
  const { data: usersData } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const emailById: Record<string, string> = {};
  if (usersData?.users) {
    for (const u of usersData.users) {
      if (u.email) emailById[u.id] = u.email;
    }
  }

  // Fetch membership counts per user
  const profileIds = data.map((r: { id: string }) => r.id);
  let tenantCounts: Record<string, number> = {};
  let primaryTenants: Record<string, string> = {};
  if (profileIds.length > 0) {
    const { data: memberships } = await sb
      .from("agency_memberships")
      .select("user_id, tenant_id, agencies!inner(display_name, slug)")
      .in("user_id", profileIds)
      .eq("status", "active");

    if (memberships) {
      const primaryMap: Record<string, string> = {};
      for (const m of memberships as Array<{
        user_id: string;
        tenant_id: string;
        agencies: unknown;
      }>) {
        tenantCounts[m.user_id] = (tenantCounts[m.user_id] ?? 0) + 1;
        if (!primaryMap[m.user_id]) {
          // Supabase returns the join as an array or single object depending on
          // the relationship type — handle both.
          const ag = m.agencies;
          const agFirst = Array.isArray(ag) ? ag[0] : ag;
          const name =
            (agFirst as { display_name?: string; slug?: string } | null)
              ?.display_name ??
            (agFirst as { display_name?: string; slug?: string } | null)?.slug ??
            m.tenant_id;
          primaryMap[m.user_id] = name;
        }
      }
      for (const [uid, name] of Object.entries(primaryMap)) {
        primaryTenants[uid] = name;
      }
    }
  }

  return data.map((r: {
    id: string;
    display_name: string | null;
    app_role: string | null;
    account_status: string | null;
    created_at: string | null;
  }) => ({
    id: r.id,
    displayName: r.display_name ?? emailById[r.id]?.split("@")[0] ?? "Unknown",
    email: emailById[r.id] ?? "—",
    appRole: r.app_role,
    accountStatus: r.account_status,
    tenantCount: tenantCounts[r.id] ?? 0,
    primaryTenant: primaryTenants[r.id] ?? null,
    isTalent: r.app_role === "talent",
    createdAt: formatDate(r.created_at),
  }));
}

// ─── Stats (Today page) ───────────────────────────────────────────────────────

export async function loadPlatformStats(): Promise<PlatformStats> {
  const sb = createServiceRoleClient();
  if (!sb) return { totalTenants: 0, totalUsers: 0, activeTenants: 0, totalTalent: 0 };

  const [tenantsRes, usersRes, activeTenantsRes, talentRes] = await Promise.all([
    sb.from("agencies").select("id", { count: "exact", head: true }),
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb.from("agencies").select("id", { count: "exact", head: true }).eq("status", "active"),
    sb.from("talent_profiles").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalTenants: tenantsRes.count ?? 0,
    totalUsers: usersRes.count ?? 0,
    activeTenants: activeTenantsRes.count ?? 0,
    totalTalent: talentRes.count ?? 0,
  };
}

// ─── Recent signups (Today page) ─────────────────────────────────────────────

export async function loadRecentSignups(limit = 5): Promise<PlatformTenantRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("agencies")
    .select("id, display_name, slug, entity_type, plan_tier, talent_seat_limit, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((r: {
    id: string;
    display_name: string;
    slug: string;
    entity_type: string | null;
    plan_tier: string | null;
    talent_seat_limit: number | null;
    status: string | null;
    created_at: string | null;
  }) => ({
    id: r.id,
    name: r.display_name ?? r.slug,
    slug: r.slug,
    entityType: r.entity_type ?? "agency",
    plan: r.plan_tier ?? "free",
    seats: r.talent_seat_limit,
    talentCount: 0,
    status: r.status ?? "active",
    createdAt: formatDate(r.created_at),
  }));
}
