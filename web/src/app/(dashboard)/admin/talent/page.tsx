import {
  ADMIN_FORM_CONTROL,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { AdminListPage } from "@/components/admin/admin-list-page";
import { AdminPageTabs } from "@/components/admin/admin-page-tabs";
import { DashboardSegmentedNav } from "@/components/dashboard/dashboard-segmented-nav";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  AdminTalentQueue,
  type AdminTalentQueueRow,
} from "@/app/(dashboard)/admin/talent/admin-talent-queue";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { AdminTalentHelpPopover } from "@/components/admin/admin-talent-help-popover";
import { getTenantScope } from "@/lib/saas/scope";
import { listAdminRosterTalentIds } from "@/lib/saas/talent-roster";
import { AdminNewTalentLink } from "@/app/(dashboard)/admin/talent/admin-new-talent-link";

const IMPOSSIBLE_ID = "00000000-0000-0000-0000-000000000000";

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "under_review", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "featured", label: "Featured" },
  { key: "hidden", label: "Hidden" },
  { key: "archived", label: "Archived" },
  { key: "deleted", label: "Removed" },
] as const;

const MEDIA_TABS = [
  { key: "all", label: "All uploads" },
  { key: "pending", label: "Pending media" },
] as const;

const PAGE_SIZE = 25;

const SORT_OPTIONS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "completion", label: "Completion" },
  { key: "name", label: "Name" },
] as const;

type TalentSortKey = (typeof SORT_OPTIONS)[number]["key"];

function talentListHref(
  status: (typeof TABS)[number]["key"],
  media: (typeof MEDIA_TABS)[number]["key"],
  options?: {
    q?: string;
    sort?: TalentSortKey;
    page?: number;
  },
) {
  const sp = new URLSearchParams();
  if (status !== "all") sp.set("status", status);
  if (media === "pending") sp.set("media", "pending");
  if (options?.q?.trim()) sp.set("q", options.q.trim());
  if (options?.sort && options.sort !== "newest") sp.set("sort", options.sort);
  if (options?.page && options.page > 1) sp.set("page", String(options.page));
  const qs = sp.toString();
  return qs ? `/admin/talent?${qs}` : "/admin/talent";
}

function applyStatusFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  status: (typeof TABS)[number]["key"],
) {
  switch (status) {
    case "draft":
      return query.eq("workflow_status", "draft").is("deleted_at", null);
    case "under_review":
      return query.in("workflow_status", ["submitted", "under_review"]).is("deleted_at", null);
    case "approved":
      return query.eq("workflow_status", "approved").is("deleted_at", null);
    case "featured":
      return query.eq("is_featured", true).is("deleted_at", null);
    case "hidden":
      return query.or("visibility.eq.hidden,workflow_status.eq.hidden").is("deleted_at", null);
    case "archived":
      return query.eq("workflow_status", "archived").is("deleted_at", null);
    case "deleted":
      return query.not("deleted_at", "is", null);
    case "all":
    default:
      return query.is("deleted_at", null);
  }
}

function applySearchFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  rawQuery: string,
) {
  const trimmed = rawQuery.trim();
  if (!trimmed) return query;
  const escaped = trimmed.replace(/[%_]/g, "\\$&");
  return query.or(
    `display_name.ilike.%${escaped}%,profile_code.ilike.%${escaped}%,phone.ilike.%${escaped}%`,
  );
}

function primaryTalentTypeLabel(taxRows: unknown): string | null {
  if (!Array.isArray(taxRows)) return null;
  for (const tr of taxRows) {
    if (!tr || typeof tr !== "object") continue;
    const t = tr as Record<string, unknown>;
    if (!t.is_primary) continue;
    const term = t.taxonomy_terms;
    const termRow = Array.isArray(term) ? term[0] : term;
    if (termRow && typeof termRow === "object") {
      const k = (termRow as Record<string, unknown>).kind;
      const name = (termRow as Record<string, unknown>).name_en;
      if (k === "talent_type" && typeof name === "string") return name;
    }
  }
  for (const tr of taxRows) {
    if (!tr || typeof tr !== "object") continue;
    const t = tr as Record<string, unknown>;
    const term = t.taxonomy_terms;
    const termRow = Array.isArray(term) ? term[0] : term;
    if (termRow && typeof termRow === "object") {
      const k = (termRow as Record<string, unknown>).kind;
      const name = (termRow as Record<string, unknown>).name_en;
      if (k === "talent_type" && typeof name === "string") return name;
    }
  }
  return null;
}

function residenceLabels(row: Record<string, unknown>): {
  city: string | null;
  country: string | null;
} {
  const rc = row.res_city;
  const rco = row.res_ctry;
  const cityRow = Array.isArray(rc) ? rc[0] : rc;
  const countryRow = Array.isArray(rco) ? rco[0] : rco;
  const city =
    cityRow && typeof cityRow === "object"
      ? ((cityRow as Record<string, unknown>).display_name_en as string | null) ?? null
      : null;
  let country: string | null =
    countryRow && typeof countryRow === "object"
      ? ((countryRow as Record<string, unknown>).name_en as string | null) ?? null
      : null;
  if (!country && countryRow && typeof countryRow === "object") {
    const iso = (countryRow as Record<string, unknown>).iso2 as string | null;
    if (iso) country = iso;
  }
  return { city, country };
}

export default async function AdminTalentListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; media?: string; q?: string; sort?: string; page?: string }>;
}) {
  const {
    status: statusFilter,
    media: mediaFilter,
    q = "",
    sort: sortParam,
    page: pageParam,
  } = await searchParams;
  const supabase = await getCachedServerSupabase();

  if (!supabase) {
    return (
      <p className="text-sm text-muted-foreground">Supabase not configured.</p>
    );
  }

  const scope = await getTenantScope();
  if (!scope) {
    return (
      <p className="text-sm text-destructive">
        No agency workspace selected. Use the workspace switcher to pick a tenant.
      </p>
    );
  }
  const rosterTalentIds = await listAdminRosterTalentIds(supabase, scope.tenantId);
  const scopedTalentIds = rosterTalentIds.length > 0 ? rosterTalentIds : [IMPOSSIBLE_ID];

  const RICH_SELECT = `
    id,
    user_id,
    profile_code,
    display_name,
    workflow_status,
    visibility,
    membership_tier,
    is_featured,
    created_at,
    updated_at,
    deleted_at,
    profile_completeness_score,
    phone,
    profiles!talent_profiles_user_id_fkey(display_name, app_role, account_status, avatar_url),
    talent_profile_taxonomy(is_primary, taxonomy_terms(kind, name_en)),
    res_city:locations!talent_profiles_residence_city_id_fkey(display_name_en),
    res_ctry:countries!talent_profiles_residence_country_id_fkey(name_en, iso2)
  `;

  const BASIC_SELECT =
    "id, user_id, profile_code, display_name, workflow_status, visibility, membership_tier, is_featured, created_at, updated_at, deleted_at, profile_completeness_score, phone, profiles!talent_profiles_user_id_fkey(display_name, app_role, account_status, avatar_url), talent_profile_taxonomy(is_primary, taxonomy_terms(kind, name_en))";

  const activeTab = TABS.find((tab) => tab.key === statusFilter)?.key ?? "all";
  const activeMediaTab = MEDIA_TABS.find((tab) => tab.key === mediaFilter)?.key ?? "all";
  const activeSort = SORT_OPTIONS.find((option) => option.key === sortParam)?.key ?? "newest";
  const currentPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const { data: pendingMediaRows, error: pendingMediaErr } = await supabase
    .from("media_assets")
    .select("owner_talent_profile_id")
    .eq("approval_state", "pending")
    .is("deleted_at", null);

  if (pendingMediaErr) {
    logServerError("admin/talent/list/mediaFilter", pendingMediaErr);
  }

  const pendingMediaCounts = new Map<string, number>();
  for (const row of pendingMediaRows ?? []) {
    const talentId = row.owner_talent_profile_id as string | null;
    if (!talentId) continue;
    pendingMediaCounts.set(talentId, (pendingMediaCounts.get(talentId) ?? 0) + 1);
  }
  const pendingMediaTalentIds = [...pendingMediaCounts.keys()];

  const buildTalentQuery = (selectClause: string, count = false) => {
    let query = supabase
      .from("talent_profiles")
      .select(selectClause, count ? { count: "exact" } : undefined)
      .in("id", scopedTalentIds);

    query = applyStatusFilter(query, activeTab);
    query = applySearchFilter(query, q);
    if (activeMediaTab === "pending") {
      if (pendingMediaTalentIds.length === 0) {
        query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);
      } else {
        query = query.in("id", pendingMediaTalentIds);
      }
    }

    switch (activeSort) {
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "completion":
        query = query.order("profile_completeness_score", { ascending: false, nullsFirst: false });
        query = query.order("created_at", { ascending: false });
        break;
      case "name":
        query = query.order("display_name", { ascending: true, nullsFirst: false });
        query = query.order("created_at", { ascending: false });
        break;
      case "newest":
      default:
        query = query.order("created_at", { ascending: false });
        break;
    }

    return query;
  };

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let pageRows: unknown[] | null = null;
  let totalCount = 0;

  const richRes = await buildTalentQuery(RICH_SELECT, true).range(from, to);

  if (richRes.error) {
    logServerError("admin/talent/list/rich", richRes.error);
    const basicRes = await buildTalentQuery(BASIC_SELECT, true).range(from, to);
    if (basicRes.error) {
      logServerError("admin/talent/list", basicRes.error);
      return (
        <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>
      );
    }
    pageRows = basicRes.data ?? [];
    totalCount = basicRes.count ?? 0;
  } else {
    pageRows = richRes.data ?? [];
    totalCount = richRes.count ?? 0;
  }

  const normalizedRows: AdminTalentQueueRow[] = (pageRows ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const { city, country } = residenceLabels(row);
    return {
      id: row.id as string,
      user_id: (row.user_id as string | null) ?? null,
      profile_code: row.profile_code as string,
      display_name: (row.display_name as string | null) ?? null,
      workflow_status: row.workflow_status as string,
      visibility: row.visibility as string,
      membership_tier: (row.membership_tier as string | null) ?? null,
      is_featured: Boolean(row.is_featured),
      created_at: row.created_at as string,
      updated_at: (row.updated_at as string | null) ?? null,
      deleted_at: (row.deleted_at as string | null) ?? null,
      profile_completeness_score: Number(row.profile_completeness_score ?? 0),
      pending_media_count: pendingMediaCounts.get(row.id as string) ?? 0,
      primary_talent_type: primaryTalentTypeLabel(row.talent_profile_taxonomy),
      residence_city_label: city,
      residence_country_label: country,
      phone: (row.phone as string | null) ?? null,
      profiles: profile
        ? {
            display_name: (profile.display_name as string | null) ?? null,
            app_role: (profile.app_role as string | null) ?? null,
            account_status: (profile.account_status as string | null) ?? null,
            avatar_url: (profile.avatar_url as string | null) ?? null,
          }
        : null,
    };
  });
  const tabCountsEntries = await Promise.all(
    TABS.map(async (tab) => {
      let query = supabase
        .from("talent_profiles")
        .select("id", { count: "exact", head: true })
        .in("id", scopedTalentIds);
      query = applyStatusFilter(query, tab.key);
      const { count, error } = await query;
      if (error) {
        logServerError(`admin/talent/list/count/${tab.key}`, error);
      }
      return [tab.key, count ?? 0] as const;
    }),
  );
  const tabCounts = Object.fromEntries(tabCountsEntries) as Record<(typeof TABS)[number]["key"], number>;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentSortLabel = SORT_OPTIONS.find((option) => option.key === activeSort)?.label ?? "Newest first";
  const filterActiveCount =
    (q.trim() ? 1 : 0) + (activeSort !== "newest" ? 1 : 0);

  return (
    <AdminListPage
      eyebrow="Roster"
      title="Talent"
      description="Triage → open a hub → review workflow, then profile, then media. Pending uploads also appear on the global Media page."
      right={
        <div className="flex items-center gap-2">
          <AdminNewTalentLink />
          <AdminTalentHelpPopover />
        </div>
      }
      tabs={
        <>
          <AdminPageTabs
            ariaLabel="Talent status"
            items={TABS.map((tab) => ({
              href: talentListHref(tab.key, activeMediaTab, { q, sort: activeSort }),
              label: `${tab.label} (${tabCounts[tab.key]})`,
              active: activeTab === tab.key,
            }))}
          />
          <DashboardSegmentedNav
            ariaLabel="Talent media filter"
            items={MEDIA_TABS.map((tab) => ({
              href: talentListHref(activeTab, tab.key, { q, sort: activeSort }),
              label: tab.label,
              active: activeMediaTab === tab.key,
            }))}
          />
        </>
      }
      filters={
        <AdminFilterBar
        title="Queue controls"
        description="Search, sort, and paginate from the URL so this roster stays shareable and scalable."
        activeCount={filterActiveCount}
      >
        <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
          <div className="space-y-1.5">
            <label htmlFor="q" className="text-sm font-medium text-foreground">
              Search
            </label>
            <Input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Search name, code, or phone"
              className={ADMIN_FORM_CONTROL}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sort" className="text-sm font-medium text-foreground">
              Sort
            </label>
            <select id="sort" name="sort" defaultValue={activeSort} className={ADMIN_FORM_CONTROL}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            {activeTab !== "all" ? <input type="hidden" name="status" value={activeTab} /> : null}
            {activeMediaTab !== "all" ? <input type="hidden" name="media" value={activeMediaTab} /> : null}
            <Button type="submit">Apply</Button>
            {(q || activeSort !== "newest") ? (
              <Button type="button" variant="outline" asChild>
                <a href={talentListHref(activeTab, activeMediaTab)}>Clear</a>
              </Button>
            ) : null}
          </div>
        </form>
        </AdminFilterBar>
      }
    >
      <DashboardSectionCard
        title="Talent queue"
        description={`Page ${currentPage} of ${totalPages} · ${totalCount} total result${totalCount === 1 ? "" : "s"} · Sorted by ${currentSortLabel}.`}
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AdminTalentQueue
          rows={normalizedRows}
          page={currentPage}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          totalPages={totalPages}
          baseHref={talentListHref(activeTab, activeMediaTab, { q, sort: activeSort })}
          emptyHint={
            <>
              {activeMediaTab === "pending" ? (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  “Pending media” only shows talent with uploads awaiting approval. Use{" "}
                  <span className="font-medium text-foreground">All uploads</span> to see the full
                  queue.
                </p>
              ) : null}
              {totalCount === 0 && tabCounts.all === 0 ? (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  If this project is new, the database may be empty. Run{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    supabase/seed_demo_profiles.sql
                  </code>{" "}
                  in the Supabase SQL editor (service role / postgres), or locally run{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    supabase db reset
                  </code>{" "}
                  so seeds apply. The public directory only lists profiles that are{" "}
                  <span className="font-medium text-foreground">approved</span> and{" "}
                  <span className="font-medium text-foreground">public</span>.
                </p>
              ) : null}
            </>
          }
        />
      </DashboardSectionCard>
    </AdminListPage>
  );
}
