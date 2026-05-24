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

import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
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

export type PlatformUserMembership = {
  tenantId: string;
  name: string;
  slug: string;
  kind: "agency" | "hub" | string;
  plan: string;
  role: string;
};

// Federated user/people row types + loader live in `platform-users-data.ts`
// (kept out of this file to stay under the 800-line eslint cap).
export type {
  HumanUserRow,
  UnclaimedTalentRow,
  PlatformUserRow,
} from "./platform-users-data";
export {
  loadPlatformPeopleFederated,
  loadPlatformUsers,
} from "./platform-users-data";

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
      kind,
      plan_tier,
      talent_seat_limit,
      status,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    logServerError("platform_data", error);
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
    kind: string | null;
    plan_tier: string | null;
    talent_seat_limit: number | null;
    status: string | null;
    created_at: string | null;
  }) => ({
    id: r.id,
    name: r.display_name ?? r.slug,
    slug: r.slug,
    entityType: r.kind ?? "agency",
    plan: r.plan_tier ?? "free",
    seats: r.talent_seat_limit,
    talentCount: talentCounts[r.id] ?? 0,
    status: r.status ?? "active",
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
    .select("id, display_name, slug, kind, plan_tier, talent_seat_limit, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((r: {
    id: string;
    display_name: string;
    slug: string;
    kind: string | null;
    plan_tier: string | null;
    talent_seat_limit: number | null;
    status: string | null;
    created_at: string | null;
  }) => ({
    id: r.id,
    name: r.display_name ?? r.slug,
    slug: r.slug,
    entityType: r.kind ?? "agency",
    plan: r.plan_tier ?? "free",
    seats: r.talent_seat_limit,
    talentCount: 0,
    status: r.status ?? "active",
    createdAt: formatDate(r.created_at),
  }));
}

// ─── Tenant detail (Phase 3.11 — /platform/admin/tenants/[id]) ───────────────

export type PlatformTenantMember = {
  id: string;
  profileId: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type PlatformTenantTalent = {
  id: string;
  displayName: string;
  status: string;
  workflowStatus: string | null;
  createdAt: string;
};

export type PlatformTenantDetail = {
  id: string;
  name: string;
  slug: string;
  entityType: string;
  plan: string;
  seats: number | null;
  status: string;
  createdAt: string;
  createdAtRaw: string | null;
  brandingJson: unknown;
  domainCount: number;
  talentCount: number;
  memberCount: number;
  inquiryCount: number;
  bookingCount: number;
  members: PlatformTenantMember[];
  talent: PlatformTenantTalent[];
  primaryDomain: string | null;
};

export async function loadPlatformTenantDetail(
  tenantId: string,
): Promise<PlatformTenantDetail | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  const { data: agency, error: agencyError } = await sb
    .from("agencies")
    .select(`
      id,
      display_name,
      slug,
      kind,
      plan_tier,
      talent_seat_limit,
      status,
      created_at
    `)
    .eq("id", tenantId)
    .maybeSingle();

  if (agencyError || !agency) {
    void improntaLog("platform_data.error", {
      message: "[platform-data] loadPlatformTenantDetail:",
      agencyError: agencyError?.message ?? null,
    });
    return null;
  }

  // Memberships → join profiles (display_name only — emails come from auth admin API).
  const { data: memberships } = await sb
    .from("agency_memberships")
    .select(`
      id,
      profile_id,
      role,
      status,
      accepted_at,
      created_at,
      profiles:profile_id ( display_name )
    `)
    .eq("tenant_id", tenantId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  const memberProfileIds = (memberships ?? []).map(
    (m: { profile_id: string }) => m.profile_id,
  );

  const emailById: Record<string, string> = {};
  if (memberProfileIds.length > 0) {
    const { data: usersData } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (usersData?.users) {
      for (const u of usersData.users) {
        if (u.email && memberProfileIds.includes(u.id)) emailById[u.id] = u.email;
      }
    }
  }

  const members: PlatformTenantMember[] = (memberships ?? []).map((m: {
    id: string;
    profile_id: string;
    role: string;
    status: string;
    accepted_at: string | null;
    created_at: string | null;
    profiles: unknown;
  }) => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const displayName =
      (profile as { display_name?: string | null } | null)?.display_name ??
      emailById[m.profile_id]?.split("@")[0] ??
      m.profile_id.slice(0, 8);
    return {
      id: m.id,
      profileId: m.profile_id,
      displayName,
      email: emailById[m.profile_id] ?? "—",
      role: m.role,
      status: m.status,
      acceptedAt: m.accepted_at,
      createdAt: formatDate(m.created_at),
    };
  });

  // Roster (top 25 by created_at).
  const { data: rosterRows } = await sb
    .from("agency_talent_roster")
    .select(`
      id,
      status,
      created_at,
      talent_profiles:talent_profile_id (
        id,
        display_name,
        first_name,
        last_name,
        workflow_status
      )
    `)
    .eq("tenant_id", tenantId)
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .limit(25);

  const talent: PlatformTenantTalent[] = (rosterRows ?? []).map((r: {
    id: string;
    status: string;
    created_at: string | null;
    talent_profiles: unknown;
  }) => {
    const tp = Array.isArray(r.talent_profiles)
      ? r.talent_profiles[0]
      : r.talent_profiles;
    const tpRec = tp as {
      id?: string;
      display_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      workflow_status?: string | null;
    } | null;
    const fullName = [tpRec?.first_name, tpRec?.last_name].filter(Boolean).join(" ").trim();
    return {
      id: tpRec?.id ?? r.id,
      displayName: tpRec?.display_name ?? fullName ?? "Unnamed",
      status: r.status,
      workflowStatus: tpRec?.workflow_status ?? null,
      createdAt: formatDate(r.created_at),
    };
  });

  // Counts.
  const [talentCountRes, inquiryCountRes, bookingCountRes, domainsRes] =
    await Promise.all([
      sb
        .from("agency_talent_roster")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .neq("status", "removed"),
      sb
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      sb
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      sb
        .from("agency_domains")
        .select("hostname")
        .eq("tenant_id", tenantId),
    ]);

  // Pick the most "primary-looking" domain heuristic: shortest non-vercel hostname.
  let primaryDomain: string | null = null;
  if (domainsRes.data && domainsRes.data.length > 0) {
    const hosts = (domainsRes.data as Array<{ hostname: string }>)
      .map((d) => d.hostname)
      .filter((h) => h && !h.endsWith(".vercel.app"));
    primaryDomain = hosts.sort((a, b) => a.length - b.length)[0] ?? null;
  }

  return {
    id: agency.id,
    name: agency.display_name ?? agency.slug,
    slug: agency.slug,
    entityType: agency.kind ?? "agency",
    plan: agency.plan_tier ?? "free",
    seats: agency.talent_seat_limit ?? null,
    status: agency.status ?? "active",
    createdAt: formatDate(agency.created_at),
    createdAtRaw: agency.created_at,
    brandingJson: null,
    domainCount: domainsRes.data?.length ?? 0,
    talentCount: talentCountRes.count ?? 0,
    memberCount: members.length,
    inquiryCount: inquiryCountRes.count ?? 0,
    bookingCount: bookingCountRes.count ?? 0,
    members,
    talent,
    primaryDomain,
  };
}

// ─── Plan distribution (Billing page) ────────────────────────────────────────

export type PlatformPlanDistributionRow = {
  plan: string;
  tenantCount: number;
  activeCount: number;
};

export async function loadPlatformPlanDistribution(): Promise<PlatformPlanDistributionRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("agencies")
    .select("plan_tier, status")
    .limit(2000);

  if (error || !data) return [];

  const counts: Record<string, { total: number; active: number }> = {};
  for (const row of data as Array<{ plan_tier: string | null; status: string | null }>) {
    const plan = row.plan_tier ?? "free";
    if (!counts[plan]) counts[plan] = { total: 0, active: 0 };
    counts[plan].total += 1;
    if ((row.status ?? "active") === "active") counts[plan].active += 1;
  }

  // Stable ordering — show all plans even if 0.
  const PLAN_ORDER = ["free", "studio", "agency", "network"];
  const result: PlatformPlanDistributionRow[] = [];
  for (const plan of PLAN_ORDER) {
    result.push({
      plan,
      tenantCount: counts[plan]?.total ?? 0,
      activeCount: counts[plan]?.active ?? 0,
    });
  }
  // Append any unknown plan_tier values (defensive).
  for (const plan of Object.keys(counts)) {
    if (!PLAN_ORDER.includes(plan)) {
      result.push({
        plan,
        tenantCount: counts[plan].total,
        activeCount: counts[plan].active,
      });
    }
  }
  return result;
}

// ─── Super admins (Settings page HQ team) ────────────────────────────────────

export type PlatformSuperAdminRow = {
  id: string;
  displayName: string;
  email: string;
  appRole: string;
  createdAt: string;
};

export async function loadPlatformSuperAdmins(): Promise<PlatformSuperAdminRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, app_role, created_at")
    .in("app_role", ["super_admin", "agency_staff"])
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  // Resolve emails via auth admin API.
  const emailById: Record<string, string> = {};
  const { data: usersData } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (usersData?.users) {
    for (const u of usersData.users) {
      if (u.email) emailById[u.id] = u.email;
    }
  }

  return (data as Array<{
    id: string;
    display_name: string | null;
    app_role: string | null;
    created_at: string | null;
  }>).map((r) => ({
    id: r.id,
    displayName: r.display_name ?? emailById[r.id]?.split("@")[0] ?? "Unknown",
    email: emailById[r.id] ?? "—",
    appRole: r.app_role ?? "agency_staff",
    createdAt: formatDate(r.created_at),
  }));
}

// ─── Network stats (Network page) ────────────────────────────────────────────

export type PlatformNetworkStats = {
  totalTalent: number;
  publishedTalent: number;
  draftTalent: number;
  invitedTalent: number;
  claimedTalent: number;
  agenciesActive: number;
  hubsActive: number;
};

export async function loadPlatformNetworkStats(): Promise<PlatformNetworkStats> {
  const sb = createServiceRoleClient();
  if (!sb) {
    return {
      totalTalent: 0,
      publishedTalent: 0,
      draftTalent: 0,
      invitedTalent: 0,
      claimedTalent: 0,
      agenciesActive: 0,
      hubsActive: 0,
    };
  }

  const [allTalent, publishedTalent, draftTalent, invitedTalent, claimedTalent, agenciesActive, hubsActive] =
    await Promise.all([
      sb.from("talent_profiles").select("id", { count: "exact", head: true }),
      sb
        .from("talent_profiles")
        .select("id", { count: "exact", head: true })
        .eq("workflow_status", "published"),
      sb
        .from("talent_profiles")
        .select("id", { count: "exact", head: true })
        .eq("workflow_status", "draft"),
      sb
        .from("talent_profiles")
        .select("id", { count: "exact", head: true })
        .eq("workflow_status", "invited"),
      sb
        .from("talent_profiles")
        .select("id", { count: "exact", head: true })
        .not("user_id", "is", null),
      sb
        .from("agencies")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .neq("kind", "hub"),
      sb
        .from("agencies")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("kind", "hub"),
    ]);

  return {
    totalTalent: allTalent.count ?? 0,
    publishedTalent: publishedTalent.count ?? 0,
    draftTalent: draftTalent.count ?? 0,
    invitedTalent: invitedTalent.count ?? 0,
    claimedTalent: claimedTalent.count ?? 0,
    agenciesActive: agenciesActive.count ?? 0,
    hubsActive: hubsActive.count ?? 0,
  };
}
