/**
 * Platform Admin — tenant management center data loaders.
 *
 * The richer tenant list + drawer/full-page management surface used by
 * /platform/admin/tenants. Split out of platform-data.ts to keep both files
 * within the file-size budget. All reads use the service-role client; the
 * platform layout enforces super_admin.
 */

import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  isWorkspacePlanTier,
  type WorkspacePlanOverride,
  type WorkspacePlanTier,
} from "@/lib/platform/plan-override";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Platform tenant-management center (Phase — /platform/admin/tenants) ──────
//
// The richer tenant list + drawer/full-page management surface. Distinct from
// the lean `loadPlatformTenants` above (kept for the Today page). All reads
// run with the service-role client; the platform layout enforces super_admin.

function coerceTier(raw: unknown): WorkspacePlanTier {
  return isWorkspacePlanTier(raw) ? raw : "free";
}

function buildWorkspaceUrls(
  slug: string,
  primaryHost: string | null,
  customHost: string | null,
): {
  publicSite: string;
  adminDashboard: string;
  billing: string;
  customDomain: string | null;
} {
  const isDev = process.env.NODE_ENV !== "production";
  const base = isDev ? "http://localhost:3000" : "https://tulala.digital";
  return {
    // In production a verified primary host is the real storefront; the
    // path form always works as a fallback. In dev everything is path-based.
    publicSite:
      !isDev && primaryHost ? `https://${primaryHost}` : `${base}/${slug}`,
    adminDashboard: `${base}/${slug}/admin`,
    billing: `${base}/${slug}/admin/account`,
    customDomain: customHost ? `https://${customHost}` : null,
  };
}

type DomainPick = { hostname: string; kind: string; is_primary: boolean | null };

function pickPrimaryHost(rows: DomainPick[]): string | null {
  if (rows.length === 0) return null;
  const ranked = [...rows].sort((a, b) => {
    const pa = a.is_primary ? 0 : 1;
    const pb = b.is_primary ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ka = a.kind === "custom" ? 0 : 1;
    const kb = b.kind === "custom" ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return a.hostname.length - b.hostname.length;
  });
  return ranked[0]?.hostname ?? null;
}

function pickCustomHost(rows: DomainPick[]): string | null {
  const customs = rows.filter((r) => r.kind === "custom");
  if (customs.length === 0) return null;
  return (customs.find((r) => r.is_primary) ?? customs[0]).hostname;
}

export type PlatformTenantListRow = {
  id: string;
  name: string;
  slug: string;
  entityType: string;
  plan: WorkspacePlanTier;
  status: string;
  seats: number | null;
  activeTalentCount: number;
  totalTalentCount: number;
  talentTypeCount: number;
  staffCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
  hasOwner: boolean;
  hasActiveOverride: boolean;
  overrideExpiresAt: string | null;
  languageSummary: string;
  publicUrl: string;
  adminUrl: string;
  createdAt: string | null;
  createdAtLabel: string;
  updatedAt: string | null;
  updatedAtLabel: string;
};

/**
 * Full tenant list for the platform management table. Self-heals any expired
 * plan overrides before reading, so the table never shows a stale effective
 * plan.
 */
export async function loadPlatformTenantList(): Promise<PlatformTenantListRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  // Reconcile expired overrides so plan_tier is honest before we read it.
  try {
    await sb.rpc("reconcile_expired_plan_overrides", { p_tenant_id: null });
  } catch (err) {
    logServerError("platform_data.reconcile", err);
  }

  const { data: agencies, error } = await sb
    .from("agencies")
    .select(
      "id, display_name, slug, kind, plan_tier, talent_seat_limit, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !agencies) {
    logServerError("platform_data.tenantList", error);
    return [];
  }

  const ids = agencies.map((r: { id: string }) => r.id);
  if (ids.length === 0) return [];

  const [rosterRes, membershipRes, overrideRes, domainRes, identityRes] = await Promise.all([
    sb
      .from("agency_talent_roster")
      .select("tenant_id, status, talent_profile_id")
      .in("tenant_id", ids)
      .neq("status", "removed"),
    sb
      .from("agency_memberships")
      .select("tenant_id, profile_id, role, status")
      .in("tenant_id", ids)
      .neq("status", "removed"),
    sb
      .from("workspace_plan_overrides")
      .select("tenant_id, expires_at")
      .in("tenant_id", ids)
      .eq("status", "active"),
    sb
      .from("agency_domains")
      .select("tenant_id, hostname, kind, is_primary")
      .in("tenant_id", ids),
    sb
      .from("agency_business_identity")
      .select("tenant_id, default_locale, supported_locales, show_language_switcher")
      .in("tenant_id", ids),
  ]);

  // Roster → active talent set + total count per tenant.
  const activeTalentsByTenant = new Map<string, Set<string>>();
  const totalTalentByTenant = new Map<string, number>();
  const allActiveTalentIds = new Set<string>();
  for (const r of (rosterRes.data ?? []) as Array<{
    tenant_id: string;
    status: string;
    talent_profile_id: string;
  }>) {
    totalTalentByTenant.set(
      r.tenant_id,
      (totalTalentByTenant.get(r.tenant_id) ?? 0) + 1,
    );
    if (r.status === "active") {
      let set = activeTalentsByTenant.get(r.tenant_id);
      if (!set) {
        set = new Set();
        activeTalentsByTenant.set(r.tenant_id, set);
      }
      set.add(r.talent_profile_id);
      allActiveTalentIds.add(r.talent_profile_id);
    }
  }

  // Memberships → staff count + owner profile id per tenant.
  const staffCountByTenant = new Map<string, number>();
  const ownerProfileByTenant = new Map<string, string>();
  for (const m of (membershipRes.data ?? []) as Array<{
    tenant_id: string;
    profile_id: string;
    role: string;
    status: string;
  }>) {
    staffCountByTenant.set(
      m.tenant_id,
      (staffCountByTenant.get(m.tenant_id) ?? 0) + 1,
    );
    if (m.role === "owner" && m.status === "active") {
      ownerProfileByTenant.set(m.tenant_id, m.profile_id);
    }
  }

  // Talent-type taxonomy for active rostered talents.
  const typesByTalent = new Map<string, Set<string>>();
  if (allActiveTalentIds.size > 0) {
    const { data: tpt } = await sb
      .from("talent_profile_taxonomy")
      .select("talent_profile_id, taxonomy_term_id, taxonomy_terms!inner(kind)")
      .in("talent_profile_id", Array.from(allActiveTalentIds))
      .eq("taxonomy_terms.kind", "talent_type");
    for (const row of (tpt ?? []) as Array<{
      talent_profile_id: string;
      taxonomy_term_id: string;
    }>) {
      let set = typesByTalent.get(row.talent_profile_id);
      if (!set) {
        set = new Set();
        typesByTalent.set(row.talent_profile_id, set);
      }
      set.add(row.taxonomy_term_id);
    }
  }

  // Owner names + emails.
  const ownerIds = Array.from(new Set(ownerProfileByTenant.values()));
  const ownerNameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, display_name")
      .in("id", ownerIds);
    for (const p of (profiles ?? []) as Array<{
      id: string;
      display_name: string | null;
    }>) {
      if (p.display_name) ownerNameById.set(p.id, p.display_name);
    }
  }
  const emailById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: usersData } = await sb.auth.admin.listUsers({ perPage: 1000 });
    for (const u of usersData?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
  }

  // Active overrides + domains per tenant.
  const overrideByTenant = new Map<string, string | null>();
  for (const o of (overrideRes.data ?? []) as Array<{
    tenant_id: string;
    expires_at: string | null;
  }>) {
    overrideByTenant.set(o.tenant_id, o.expires_at);
  }
  const domainsByTenant = new Map<string, DomainPick[]>();
  for (const d of (domainRes.data ?? []) as Array<
    DomainPick & { tenant_id: string }
  >) {
    const list = domainsByTenant.get(d.tenant_id) ?? [];
    list.push({ hostname: d.hostname, kind: d.kind, is_primary: d.is_primary });
    domainsByTenant.set(d.tenant_id, list);
  }
  const languageByTenant = new Map<string, {
    default_locale: string | null; supported_locales: string[] | null; show_language_switcher: boolean | null;
  }>();
  for (const row of (identityRes.data ?? []) as Array<{
    tenant_id: string; default_locale: string | null; supported_locales: string[] | null; show_language_switcher: boolean | null;
  }>) {
    languageByTenant.set(row.tenant_id, row);
  }

  return (agencies as Array<{
    id: string;
    display_name: string | null;
    slug: string;
    kind: string | null;
    plan_tier: string | null;
    talent_seat_limit: number | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>).map((r) => {
    const activeTalents = activeTalentsByTenant.get(r.id) ?? new Set<string>();
    const typeIds = new Set<string>();
    for (const tid of activeTalents) {
      const set = typesByTalent.get(tid);
      if (set) for (const term of set) typeIds.add(term);
    }
    const ownerId = ownerProfileByTenant.get(r.id) ?? null;
    const domains = domainsByTenant.get(r.id) ?? [];
    const urls = buildWorkspaceUrls(
      r.slug,
      pickPrimaryHost(domains),
      pickCustomHost(domains),
    );
    const lang = languageByTenant.get(r.id);
    const activeLocales = Array.isArray(lang?.supported_locales) && lang.supported_locales.length > 0
      ? lang.supported_locales
      : ["en"];
    const defaultLocale = lang?.default_locale ?? activeLocales[0] ?? "en";
    const showLanguageSwitcher = lang?.show_language_switcher ?? true;
    return {
      id: r.id,
      name: r.display_name ?? r.slug,
      slug: r.slug,
      entityType: r.kind ?? "agency",
      plan: coerceTier(r.plan_tier),
      status: r.status ?? "active",
      seats: r.talent_seat_limit,
      activeTalentCount: activeTalents.size,
      totalTalentCount: totalTalentByTenant.get(r.id) ?? 0,
      talentTypeCount: typeIds.size,
      staffCount: staffCountByTenant.get(r.id) ?? 0,
      ownerName: ownerId ? ownerNameById.get(ownerId) ?? null : null,
      ownerEmail: ownerId ? emailById.get(ownerId) ?? null : null,
      hasOwner: Boolean(ownerId),
      hasActiveOverride: overrideByTenant.has(r.id),
      overrideExpiresAt: overrideByTenant.get(r.id) ?? null,
      languageSummary:
        activeLocales.length > 1 && showLanguageSwitcher
          ? `${defaultLocale.toUpperCase()} default · ${activeLocales.map((l) => l.toUpperCase()).join("/")}`
          : activeLocales.length > 1
            ? `${defaultLocale.toUpperCase()} default · switcher off`
          : `${defaultLocale.toUpperCase()} only`,
      publicUrl: urls.publicSite,
      adminUrl: urls.adminDashboard,
      createdAt: r.created_at,
      createdAtLabel: formatDate(r.created_at),
      updatedAt: r.updated_at,
      updatedAtLabel: formatDate(r.updated_at),
    };
  });
}

// ─── Tenant management detail (drawer + full page) ───────────────────────────

export type TenantManagementMember = {
  membershipId: string;
  profileId: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  joinedAt: string | null;
  joinedAtLabel: string;
};

export type TenantManagementAuditEntry = {
  action: string;
  actorRole: string | null;
  severity: string;
  createdAt: string;
  createdAtLabel: string;
};

export type TenantManagementDetail = {
  id: string;
  name: string;
  slug: string;
  entityType: string;
  status: string;
  plan: WorkspacePlanTier;
  seats: number | null;
  createdAt: string | null;
  createdAtLabel: string;
  updatedAt: string | null;
  updatedAtLabel: string;
  activeTalentCount: number;
  totalTalentCount: number;
  talentTypeCount: number;
  talentTypes: string[];
  staffCount: number;
  inquiryCount: number;
  bookingCount: number;
  domainCount: number;
  owner: { profileId: string; displayName: string; email: string } | null;
  language: { defaultLocale: string; activeLocales: string[]; switcherStatus: "shown" | "hidden"; showLanguageSwitcher: boolean; mode: "tenant-managed" | "fallback"; updatedAt: string | null; updatedAtLabel: string };
  billing: {
    effectivePlan: WorkspacePlanTier;
    basePlan: WorkspacePlanTier | null;
    subscriptionStatus: string | null;
    subscriptionPlan: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
  };
  commission: { override: { platformTakeBps: number | null; platformTakeFloorCents: number | null; overrideNote: string; setAt: string } | null; openRequest: { requestedPlatformTakeBps: number | null; requestedNote: string | null; requestedAt: string | null; requestStatus: string } | null };
  override: WorkspacePlanOverride | null;
  overrideHistory: WorkspacePlanOverride[];
  urls: { publicSite: string; adminDashboard: string; billing: string; customDomain: string | null };
  signupContext: {
    audience: string | null;
    rosterSize: string | null;
    tierInterest: string | null;
  } | null;
  members: TenantManagementMember[];
  recentAudit: TenantManagementAuditEntry[];
};

type OverrideDbRow = {
  id: string;
  tenant_id: string;
  status: string;
  base_plan_tier: string;
  base_talent_seat_limit: number | null;
  override_plan_tier: string;
  override_talent_seat_limit: number | null;
  starts_at: string;
  expires_at: string | null;
  reason: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  ended_at: string | null;
};

function mapOverrideRow(
  row: OverrideDbRow,
  createdByName: string | null,
): WorkspacePlanOverride {
  const status: WorkspacePlanOverride["status"] =
    row.status === "active" || row.status === "expired" || row.status === "revoked"
      ? row.status
      : "expired";
  return {
    id: row.id,
    tenantId: row.tenant_id,
    status,
    basePlanTier: coerceTier(row.base_plan_tier),
    baseTalentSeatLimit: row.base_talent_seat_limit,
    overridePlanTier: coerceTier(row.override_plan_tier),
    overrideTalentSeatLimit: row.override_talent_seat_limit,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    reason: row.reason,
    note: row.note,
    createdByName,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

/**
 * Single-workspace management detail for the drawer and the full page.
 * Reconciles this tenant's expired override before reading.
 */
export async function loadTenantManagementDetail(
  tenantId: string,
): Promise<TenantManagementDetail | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  try {
    await sb.rpc("reconcile_expired_plan_overrides", { p_tenant_id: tenantId });
  } catch (err) {
    logServerError("platform_data.reconcile.one", err);
  }

  const { data: agency, error: agencyError } = await sb
    .from("agencies")
    .select(
      "id, display_name, slug, kind, plan_tier, talent_seat_limit, status, created_at, updated_at, settings",
    )
    .eq("id", tenantId)
    .maybeSingle();
  if (agencyError || !agency) {
    void improntaLog("platform_data.error", {
      message: "[platform-data] loadTenantManagementDetail",
      agencyError: agencyError?.message ?? null,
    });
    return null;
  }

  const [
    membershipRes,
    rosterRes,
    overrideRes,
    subRes,
    domainRes,
    auditRes,
    inquiryCountRes,
    bookingCountRes,
    identityRes,
    commissionRes,
  ] = await Promise.all([
    sb
      .from("agency_memberships")
      .select("id, profile_id, role, status, accepted_at, created_at, profiles:profile_id(display_name)")
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true }),
    sb
      .from("agency_talent_roster")
      .select("status, talent_profile_id")
      .eq("tenant_id", tenantId)
      .neq("status", "removed"),
    sb
      .from("workspace_plan_overrides")
      .select(
        "id, tenant_id, status, base_plan_tier, base_talent_seat_limit, override_plan_tier, override_talent_seat_limit, starts_at, expires_at, reason, note, created_by, created_at, ended_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8),
    sb
      .from("workspace_subscriptions")
      .select(
        "plan_key, status, current_period_end, trial_end, stripe_subscription_id, stripe_customer_id",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    sb
      .from("agency_domains")
      .select("hostname, kind, is_primary")
      .eq("tenant_id", tenantId),
    sb
      .from("platform_audit_log")
      .select("action, actor_role, severity, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8),
    sb
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    sb
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    sb
      .from("agency_business_identity")
      .select("default_locale, supported_locales, show_language_switcher, updated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    sb.from("workspace_commission_overrides").select("platform_take_bps, platform_take_floor_cents, override_note, set_at, requested_platform_take_bps, requested_note, requested_at, request_status").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  // Members — resolve emails via the auth admin API.
  const membershipRows = (membershipRes.data ?? []) as Array<{
    id: string;
    profile_id: string;
    role: string;
    status: string;
    accepted_at: string | null;
    created_at: string | null;
    profiles: unknown;
  }>;
  const memberProfileIds = membershipRows.map((m) => m.profile_id);
  const overrideCreatorIds = ((overrideRes.data ?? []) as OverrideDbRow[])
    .map((o) => o.created_by)
    .filter((v): v is string => Boolean(v));
  const wantedUserIds = new Set([...memberProfileIds, ...overrideCreatorIds]);

  const emailById: Record<string, string> = {};
  const nameById: Record<string, string> = {};
  if (wantedUserIds.size > 0) {
    const { data: usersData } = await sb.auth.admin.listUsers({ perPage: 1000 });
    for (const u of usersData?.users ?? []) {
      if (u.email && wantedUserIds.has(u.id)) emailById[u.id] = u.email;
    }
    const { data: profileRows } = await sb
      .from("profiles")
      .select("id, display_name")
      .in("id", Array.from(wantedUserIds));
    for (const p of (profileRows ?? []) as Array<{
      id: string;
      display_name: string | null;
    }>) {
      if (p.display_name) nameById[p.id] = p.display_name;
    }
  }

  const members: TenantManagementMember[] = membershipRows.map((m) => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const displayName =
      (profile as { display_name?: string | null } | null)?.display_name ??
      nameById[m.profile_id] ??
      emailById[m.profile_id]?.split("@")[0] ??
      m.profile_id.slice(0, 8);
    return {
      membershipId: m.id,
      profileId: m.profile_id,
      displayName,
      email: emailById[m.profile_id] ?? "—",
      role: m.role,
      status: m.status,
      joinedAt: m.accepted_at ?? m.created_at,
      joinedAtLabel: formatDate(m.accepted_at ?? m.created_at),
    };
  });

  const ROLE_RANK: Record<string, number> = {
    owner: 5,
    admin: 4,
    manager: 3,
    editor: 2,
    viewer: 1,
  };
  members.sort((a, b) => {
    const ra = ROLE_RANK[a.role] ?? 0;
    const rb = ROLE_RANK[b.role] ?? 0;
    if (ra !== rb) return rb - ra;
    return (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "");
  });

  const ownerMember = members.find(
    (m) => m.role === "owner" && m.status === "active",
  );

  // Roster counts + talent types.
  const rosterRows = (rosterRes.data ?? []) as Array<{
    status: string;
    talent_profile_id: string;
  }>;
  const activeTalentIds = rosterRows
    .filter((r) => r.status === "active")
    .map((r) => r.talent_profile_id);
  const talentTypes: string[] = [];
  if (activeTalentIds.length > 0) {
    const { data: tpt } = await sb
      .from("talent_profile_taxonomy")
      .select("taxonomy_terms!inner(kind, name_en)")
      .in("talent_profile_id", activeTalentIds)
      .eq("taxonomy_terms.kind", "talent_type");
    const seen = new Set<string>();
    for (const row of (tpt ?? []) as Array<{ taxonomy_terms: unknown }>) {
      const term = Array.isArray(row.taxonomy_terms)
        ? row.taxonomy_terms[0]
        : row.taxonomy_terms;
      const name = (term as { name_en?: string | null } | null)?.name_en;
      if (name && !seen.has(name)) {
        seen.add(name);
        talentTypes.push(name);
      }
    }
  }
  talentTypes.sort((a, b) => a.localeCompare(b));

  // Domains.
  const domainRows = (domainRes.data ?? []) as DomainPick[];
  const urls = buildWorkspaceUrls(
    agency.slug,
    pickPrimaryHost(domainRows),
    pickCustomHost(domainRows),
  );

  // Overrides — active row + recent history.
  const overrideRows = (overrideRes.data ?? []) as OverrideDbRow[];
  const mappedOverrides = overrideRows.map((o) =>
    mapOverrideRow(o, o.created_by ? nameById[o.created_by] ?? null : null),
  );
  const activeOverride = mappedOverrides.find((o) => o.status === "active") ?? null;
  const overrideHistory = mappedOverrides.filter((o) => o.status !== "active");

  const sub = subRes.data as {
    plan_key: string | null;
    status: string | null;
    current_period_end: string | null;
    trial_end: string | null;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
  } | null;

  const effectivePlan = coerceTier(agency.plan_tier);

  type CommRow = { platform_take_bps: number | null; platform_take_floor_cents: number | null; override_note: string | null; set_at: string | null; requested_platform_take_bps: number | null; requested_note: string | null; requested_at: string | null; request_status: string | null };
  const cr = commissionRes.data as CommRow | null;
  const commissionOverride = cr && (cr.platform_take_bps !== null || cr.platform_take_floor_cents !== null) ? { platformTakeBps: cr.platform_take_bps, platformTakeFloorCents: cr.platform_take_floor_cents, overrideNote: cr.override_note ?? "", setAt: cr.set_at ?? "" } : null;
  const commissionOpenRequest = cr?.request_status === "open" ? { requestedPlatformTakeBps: cr.requested_platform_take_bps, requestedNote: cr.requested_note ?? null, requestedAt: cr.requested_at ?? null, requestStatus: cr.request_status } : null;

  const identity = identityRes.data as {
    default_locale: string | null;
    supported_locales: string[] | null;
    show_language_switcher: boolean | null;
    updated_at: string | null;
  } | null;
  const activeLocales =
    Array.isArray(identity?.supported_locales) && identity.supported_locales.length > 0
      ? identity.supported_locales
      : ["en"];
  const defaultLocale = identity?.default_locale ?? activeLocales[0] ?? "en";
  const showLanguageSwitcher = identity?.show_language_switcher ?? true;

  const settings =
    agency.settings && typeof agency.settings === "object" && !Array.isArray(agency.settings)
      ? (agency.settings as Record<string, unknown>)
      : null;
  const signupContext = settings
    ? {
        audience:
          typeof settings.signup_audience === "string" ? settings.signup_audience : null,
        rosterSize:
          typeof settings.signup_roster_size === "string"
            ? settings.signup_roster_size
            : null,
        tierInterest:
          typeof settings.signup_tier_interest === "string"
            ? settings.signup_tier_interest
            : null,
      }
    : null;
  const hasSignupContext =
    signupContext &&
    (signupContext.audience || signupContext.rosterSize || signupContext.tierInterest);

  return {
    id: agency.id,
    name: agency.display_name ?? agency.slug,
    slug: agency.slug,
    entityType: agency.kind ?? "agency",
    status: agency.status ?? "active",
    plan: effectivePlan,
    seats: agency.talent_seat_limit,
    createdAt: agency.created_at,
    createdAtLabel: formatDate(agency.created_at),
    updatedAt: agency.updated_at,
    updatedAtLabel: formatDate(agency.updated_at),
    activeTalentCount: activeTalentIds.length,
    totalTalentCount: rosterRows.length,
    talentTypeCount: talentTypes.length,
    talentTypes,
    staffCount: members.length,
    inquiryCount: inquiryCountRes.count ?? 0,
    bookingCount: bookingCountRes.count ?? 0,
    domainCount: domainRows.length,
    owner: ownerMember
      ? {
          profileId: ownerMember.profileId,
          displayName: ownerMember.displayName,
          email: ownerMember.email,
        }
      : null,
    language: {
      defaultLocale,
      activeLocales,
      switcherStatus:
        activeLocales.length > 1 && showLanguageSwitcher ? "shown" : "hidden",
      showLanguageSwitcher,
      mode: identity ? "tenant-managed" : "fallback",
      updatedAt: identity?.updated_at ?? null,
      updatedAtLabel: formatDate(identity?.updated_at),
    },
    billing: {
      effectivePlan,
      basePlan: activeOverride ? activeOverride.basePlanTier : null,
      subscriptionStatus: sub?.status ?? null,
      subscriptionPlan: sub?.plan_key ?? null,
      stripeCustomerId: sub?.stripe_customer_id ?? null,
      stripeSubscriptionId: sub?.stripe_subscription_id ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      trialEnd: sub?.trial_end ?? null,
    },
    commission: {
      override: commissionOverride,
      openRequest: commissionOpenRequest,
    },
    override: activeOverride,
    overrideHistory,
    urls,
    signupContext: hasSignupContext ? signupContext : null,
    members,
    recentAudit: ((auditRes.data ?? []) as Array<{
      action: string;
      actor_role: string | null;
      severity: string | null;
      created_at: string;
    }>).map((a) => ({
      action: a.action,
      actorRole: a.actor_role,
      severity: a.severity ?? "info",
      createdAt: a.created_at,
      createdAtLabel: formatDate(a.created_at),
    })),
  };
}

/**
 * Active plan-override summary for a workspace's own billing page. Returns
 * null when there is no active override. Uses the service-role client —
 * the override table is platform-admin-only under RLS.
 */
export type WorkspaceOverrideBanner = {
  overridePlanTier: WorkspacePlanTier;
  basePlanTier: WorkspacePlanTier;
  expiresAt: string | null;
  startedAt: string;
  reason: string | null;
};

export async function loadWorkspaceOverrideBanner(
  tenantId: string,
): Promise<WorkspaceOverrideBanner | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    await sb.rpc("reconcile_expired_plan_overrides", { p_tenant_id: tenantId });
    const { data, error } = await sb
      .from("workspace_plan_overrides")
      .select("override_plan_tier, base_plan_tier, expires_at, starts_at, reason")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null;
    return {
      overridePlanTier: coerceTier(data.override_plan_tier),
      basePlanTier: coerceTier(data.base_plan_tier),
      expiresAt: data.expires_at,
      startedAt: data.starts_at,
      reason: data.reason,
    };
  } catch (err) {
    logServerError("platform_data.overrideBanner", err);
    return null;
  }
}
