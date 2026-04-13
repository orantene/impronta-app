import Link from "next/link";
import { Download, FileText, Languages } from "lucide-react";

import {
  TranslationsBioWorkflowTable,
  type AuditPreviewRow,
} from "@/app/(dashboard)/admin/translations/translations-bio-workflow";
import {
  TranslationsLocationWorkflowTable,
  TranslationsTaxonomyWorkflowTable,
} from "@/app/(dashboard)/admin/translations/translations-tax-loc-workflow";
import {
  BIO_STATUS_FILTERS,
  TAX_LOC_STATUS_FILTERS,
  translationsHref,
  VIEW_TABS,
  parseTranslationsSearchParams,
  type BioFilterKey,
} from "@/app/(dashboard)/admin/translations/translations-url";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { TalentPageHeader } from "@/components/talent/talent-dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADMIN_FORM_CONTROL, ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { isOpenAiConfigured } from "@/lib/translation/ai-translate-bio";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

function TranslationsEmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/50 bg-muted/10 px-6 py-14 text-center shadow-sm">
      <FileText className="size-10 text-muted-foreground/45" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

type TalentBioRow = {
  id: string;
  profile_code: string;
  display_name: string | null;
  bio_es: string | null;
  bio_es_draft: string | null;
  bio_es_status: string | null;
  bio_es_updated_at: string | null;
  bio_en_updated_at: string | null;
};

function summaryQueryParams(
  status: BioFilterKey,
  q: string,
  sort: string,
  dir: string,
) {
  const sp = new URLSearchParams();
  sp.set("view", "bio");
  if (status !== "all") sp.set("status", status);
  if (q.trim()) sp.set("q", q.trim());
  if (sort !== "name") sp.set("sort", sort);
  if (dir !== "asc") sp.set("dir", dir);
  return sp.toString();
}

function SummaryCard({
  label,
  count,
  href,
  active,
  tone,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
  tone: "red" | "orange" | "amber" | "green" | "slate" | "violet";
}) {
  const ring =
    tone === "red"
      ? "border-red-500/35 hover:border-red-500/55"
      : tone === "orange"
        ? "border-orange-500/35 hover:border-orange-500/55"
        : tone === "amber"
          ? "border-amber-500/35 hover:border-amber-500/55"
          : tone === "green"
            ? "border-emerald-500/35 hover:border-emerald-500/55"
            : tone === "violet"
              ? "border-violet-500/35 hover:border-violet-500/55"
              : "border-border/60 hover:border-border";

  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-[8.5rem] flex-1 flex-col rounded-xl border bg-card/50 px-3 py-3 shadow-sm transition-all duration-200",
        ring,
        "hover:bg-card/80 hover:shadow-md",
        active ? "ring-2 ring-primary/45 shadow-md" : "",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">{count}</span>
    </Link>
  );
}

function translationCoveragePercent(done: number | null, total: number | null): number | null {
  if (done == null || total == null) return null;
  if (total <= 0) return 100;
  return Math.min(100, Math.round((done / total) * 100));
}

function TranslationProgressRow({
  label,
  done,
  total,
}: {
  label: string;
  done: number | null;
  total: number | null;
}) {
  const pct = translationCoveragePercent(done, total);
  const safeDone = done ?? 0;
  const safeTotal = total ?? 0;
  return (
    <div className="rounded-xl bg-muted/15 px-3 py-3 ring-1 ring-border/40 sm:px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {pct != null ? `${pct}%` : "—"}
          <span className="text-muted-foreground/75">
            {" "}
            ({safeDone}/{safeTotal})
          </span>
        </span>
      </div>
      <div
        className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-muted/55 shadow-inner"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} translated`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--impronta-gold)]/90 to-[var(--impronta-gold)]/70 shadow-sm transition-[width] duration-300"
          style={{ width: pct != null ? `${pct}%` : "0%" }}
        />
      </div>
    </div>
  );
}

export default async function AdminTranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    status?: string;
    bio?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const {
    view,
    bioStatusFilter,
    taxLocStatusFilter,
    q,
    bioSort,
    taxonomySort,
    locationSort,
    sortDir,
  } = parseTranslationsSearchParams(sp);

  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className={ADMIN_PAGE_STACK}>
        <p className="text-sm text-muted-foreground">Supabase not configured.</p>
      </div>
    );
  }

  let talentRows: TalentBioRow[] = [];
  let loadError: string | null = null;
  let taxonomyWorkflowRows: {
    id: string;
    kind: string;
    slug: string;
    name_en: string;
    name_es: string | null;
    updated_at: string;
  }[] = [];
  let locationWorkflowRows: {
    id: string;
    country_code: string;
    city_slug: string;
    display_name_en: string;
    display_name_es: string | null;
    updated_at: string;
  }[] = [];

  let countMissing: number | null = null;
  let countStale: number | null = null;
  let countDraft: number | null = null;
  let countApproved: number | null = null;
  let countNeedsAttention: number | null = null;
  let countTaxonomyGaps: number | null = null;
  let countLocationGaps: number | null = null;
  let countProfilesTotal: number | null = null;
  let countProfilesWithEs: number | null = null;
  let countTaxonomyTotal: number | null = null;
  let countTaxonomyWithEs: number | null = null;
  let countLocationsTotal: number | null = null;
  let countLocationsWithEs: number | null = null;

  const sortParam = bioSort;
  const dirParam = sortDir;

  const [
    cMissing,
    cStale,
    cDraft,
    cApproved,
    cNeeds,
    cTaxGaps,
    cLocGaps,
    cProfTotal,
    cProfEs,
    cTaxTotal,
    cTaxEs,
    cLocTotal,
    cLocEs,
  ] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("bio_es_status", "missing"),
    supabase
      .from("talent_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("bio_es_status", "stale"),
    supabase
      .from("talent_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("bio_es_draft", "is", null)
      .neq("bio_es_draft", ""),
    supabase
      .from("talent_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("bio_es_status", "approved"),
    supabase
      .from("talent_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .or("bio_es_status.eq.missing,bio_es_status.eq.stale,bio_es_draft.not.is.null"),
    supabase
      .from("taxonomy_terms")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .or("name_es.is.null,name_es.eq."),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .or("display_name_es.is.null,display_name_es.eq."),
    supabase.from("talent_profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("talent_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("bio_es", "is", null)
      .neq("bio_es", ""),
    supabase.from("taxonomy_terms").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase
      .from("taxonomy_terms")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .not("name_es", "is", null)
      .neq("name_es", ""),
    supabase.from("locations").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .not("display_name_es", "is", null)
      .neq("display_name_es", ""),
  ]);

  if (!cMissing.error) countMissing = cMissing.count ?? 0;
  if (!cStale.error) countStale = cStale.count ?? 0;
  if (!cDraft.error) countDraft = cDraft.count ?? 0;
  if (!cApproved.error) countApproved = cApproved.count ?? 0;
  if (!cNeeds.error) countNeedsAttention = cNeeds.count ?? 0;
  if (!cTaxGaps.error) countTaxonomyGaps = cTaxGaps.count ?? 0;
  if (!cLocGaps.error) countLocationGaps = cLocGaps.count ?? 0;
  if (!cProfTotal.error) countProfilesTotal = cProfTotal.count ?? 0;
  if (!cProfEs.error) countProfilesWithEs = cProfEs.count ?? 0;
  if (!cTaxTotal.error) countTaxonomyTotal = cTaxTotal.count ?? 0;
  if (!cTaxEs.error) countTaxonomyWithEs = cTaxEs.count ?? 0;
  if (!cLocTotal.error) countLocationsTotal = cLocTotal.count ?? 0;
  if (!cLocEs.error) countLocationsWithEs = cLocEs.count ?? 0;

  let firstMissingId: string | null = null;
  const { data: firstMissingRow } = await supabase
    .from("talent_profiles")
    .select("id")
    .is("deleted_at", null)
    .eq("bio_es_status", "missing")
    .order("profile_code", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstMissingRow?.id) firstMissingId = firstMissingRow.id;

  const openNextMissingHref = firstMissingId
    ? `/admin/talent/${firstMissingId}#bio-translation`
    : null;

  const { data: firstTaxMissing } = await supabase
    .from("taxonomy_terms")
    .select("slug")
    .is("archived_at", null)
    .or("name_es.is.null,name_es.eq.")
    .order("kind", { ascending: true })
    .order("slug", { ascending: true })
    .limit(1)
    .maybeSingle();
  const openNextTaxonomyMissingHref = firstTaxMissing?.slug
    ? `/admin/taxonomy?q=${encodeURIComponent(firstTaxMissing.slug as string)}`
    : null;

  const { data: firstLocMissing } = await supabase
    .from("locations")
    .select("city_slug")
    .is("archived_at", null)
    .or("display_name_es.is.null,display_name_es.eq.")
    .order("country_code", { ascending: true })
    .order("display_name_en", { ascending: true })
    .limit(1)
    .maybeSingle();
  const openNextLocationMissingHref = firstLocMissing?.city_slug
    ? `/admin/locations?q=${encodeURIComponent(firstLocMissing.city_slug as string)}`
    : null;

  const aiConfigured = isOpenAiConfigured();

  try {
    if (view === "bio") {
      const orderCol =
        bioSort === "code"
          ? "profile_code"
          : bioSort === "es_at"
            ? "bio_es_updated_at"
            : bioSort === "en_at"
              ? "bio_en_updated_at"
              : "display_name";
      const ascending = sortDir === "asc";

      let query = supabase
        .from("talent_profiles")
        .select(
          "id, profile_code, display_name, bio_es, bio_es_draft, bio_es_status, bio_es_updated_at, bio_en_updated_at",
        )
        .is("deleted_at", null)
        .order(orderCol, { ascending, nullsFirst: false })
        .order("profile_code", { ascending: true })
        .limit(250);

      if (bioStatusFilter === "needs_attention") {
        query = query.or("bio_es_status.eq.missing,bio_es_status.eq.stale,bio_es_draft.not.is.null");
      } else if (bioStatusFilter === "draft") {
        query = query.not("bio_es_draft", "is", null).neq("bio_es_draft", "");
      } else if (bioStatusFilter !== "all") {
        query = query.eq("bio_es_status", bioStatusFilter);
      }

      if (q) {
        const escaped = q.replace(/[%_]/g, "\\$&");
        query = query.or(`display_name.ilike.%${escaped}%,profile_code.ilike.%${escaped}%`);
      }

      const { data, error } = await query;
      if (error) {
        logServerError("admin/translations/talent", error);
        loadError = CLIENT_ERROR.loadPage;
      } else {
        talentRows = (data ?? []) as TalentBioRow[];
        if (bioStatusFilter === "needs_attention") {
          talentRows = talentRows.filter((r) => {
            const st = r.bio_es_status ?? "";
            const draft = Boolean((r.bio_es_draft ?? "").trim());
            return st === "missing" || st === "stale" || draft;
          });
        }
      }
    } else if (view === "taxonomy") {
      const ascending = sortDir === "asc";
      const orderCol =
        taxonomySort === "name_en"
          ? "name_en"
          : taxonomySort === "name_es"
            ? "name_es"
            : taxonomySort === "slug"
              ? "slug"
              : taxonomySort === "updated"
                ? "updated_at"
                : "kind";
      let tq = supabase
        .from("taxonomy_terms")
        .select("id, kind, slug, name_en, name_es, updated_at")
        .is("archived_at", null)
        .order(orderCol, { ascending, nullsFirst: false })
        .order("kind", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("slug", { ascending: true })
        .limit(500);
      if (taxLocStatusFilter === "needs_attention" || taxLocStatusFilter === "missing") {
        tq = tq.or("name_es.is.null,name_es.eq.");
      } else if (taxLocStatusFilter === "translated") {
        tq = tq.not("name_es", "is", null).neq("name_es", "");
      }
      if (q) {
        const escaped = q.replace(/[%_]/g, "\\$&");
        tq = tq.or(`name_en.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
      }
      const { data, error } = await tq;
      if (error) {
        logServerError("admin/translations/taxonomy", error);
        loadError = CLIENT_ERROR.loadPage;
      } else {
        let rows = (data ?? []) as typeof taxonomyWorkflowRows;
        if (taxLocStatusFilter === "translated") {
          rows = rows.filter((r) => (r.name_es ?? "").trim().length > 0);
        }
        taxonomyWorkflowRows = rows;
      }
    } else {
      const ascending = sortDir === "asc";
      const orderCol =
        locationSort === "display_en"
          ? "display_name_en"
          : locationSort === "display_es"
            ? "display_name_es"
            : locationSort === "slug"
              ? "city_slug"
              : locationSort === "updated"
                ? "updated_at"
                : "country_code";
      let lq = supabase
        .from("locations")
        .select("id, country_code, city_slug, display_name_en, display_name_es, updated_at")
        .is("archived_at", null)
        .order(orderCol, { ascending, nullsFirst: false })
        .order("country_code", { ascending: true })
        .order("display_name_en", { ascending: true })
        .limit(500);
      if (taxLocStatusFilter === "needs_attention" || taxLocStatusFilter === "missing") {
        lq = lq.or("display_name_es.is.null,display_name_es.eq.");
      } else if (taxLocStatusFilter === "translated") {
        lq = lq.not("display_name_es", "is", null).neq("display_name_es", "");
      }
      if (q) {
        const escaped = q.replace(/[%_]/g, "\\$&");
        lq = lq.or(
          `display_name_en.ilike.%${escaped}%,city_slug.ilike.%${escaped}%,country_code.ilike.%${escaped}%`,
        );
      }
      const { data, error } = await lq;
      if (error) {
        logServerError("admin/translations/locations", error);
        loadError = CLIENT_ERROR.loadPage;
      } else {
        let rows = (data ?? []) as typeof locationWorkflowRows;
        if (taxLocStatusFilter === "translated") {
          rows = rows.filter((r) => (r.display_name_es ?? "").trim().length > 0);
        }
        locationWorkflowRows = rows;
      }
    }
  } catch (e) {
    logServerError("admin/translations", e);
    loadError = CLIENT_ERROR.loadPage;
  }

  let auditByTalentId: Record<string, AuditPreviewRow[]> = {};
  if (view === "bio" && talentRows.length > 0) {
    const ids = talentRows.map((r) => r.id);
    const { data: auditRows, error: auditErr } = await supabase
      .from("translation_audit_events")
      .select("entity_id, created_at, event_type, actor_kind, actor_id")
      .eq("entity_type", "talent_profile")
      .in("entity_id", ids)
      .order("created_at", { ascending: false })
      .limit(1200);

    if (!auditErr && auditRows?.length) {
      const listsById = new Map<string, (typeof auditRows)[number][]>();
      for (const ev of auditRows) {
        const eid = ev.entity_id as string;
        const cur = listsById.get(eid) ?? [];
        if (cur.length >= 3) continue;
        cur.push(ev);
        listsById.set(eid, cur);
      }
      const actorIds = [
        ...new Set(
          [...listsById.values()]
            .flat()
            .filter((e) => e.actor_id && e.actor_kind === "user")
            .map((e) => e.actor_id as string),
        ),
      ];
      let actorNames: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", actorIds);
        for (const p of profs ?? []) {
          const id = p.id as string;
          const dn = (p.display_name as string | null)?.trim();
          actorNames[id] = dn || id.slice(0, 8);
        }
      }
      for (const [tid, events] of listsById) {
        auditByTalentId[tid] = events.map((ev) => {
          const aid = ev.actor_id as string | null;
          return {
            created_at: ev.created_at as string,
            event_type: ev.event_type as string,
            actor_kind: ev.actor_kind as string,
            actor_id: aid,
            actor_label: aid && ev.actor_kind === "user" ? actorNames[aid] ?? null : null,
          };
        });
      }
    }
  }

  if (loadError) {
    return (
      <div className={ADMIN_PAGE_STACK}>
        <p className="text-sm text-destructive">{loadError}</p>
      </div>
    );
  }

  const sq = (status: BioFilterKey) =>
    summaryQueryParams(status, q, sortParam, dirParam);

  const taxonomyMissingCount = countTaxonomyGaps ?? 0;
  const locationMissingCount = countLocationGaps ?? 0;

  return (
    <div className={ADMIN_PAGE_STACK}>
      <TalentPageHeader
        icon={Languages}
        title="Translations"
        description="Spanish across bios, taxonomy, and locations. Tabs pick the surface; health cards and the table below follow your choice."
      />

      <DashboardSectionCard
        title="Translation tools"
        description="AI status for this hub. Row and bulk actions use OpenAI when configured."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.06] to-transparent px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">OpenAI</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {aiConfigured
                  ? "Configured — AI translate and bulk fills are enabled for the active tab."
                  : "Set OPENAI_API_KEY on the server to enable AI-assisted fills."}
              </p>
            </div>
            <Badge
              variant={aiConfigured ? "default" : "secondary"}
              className="h-8 w-fit shrink-0 rounded-full px-3.5 text-[11px] font-semibold uppercase tracking-wide"
            >
              {aiConfigured ? "Available" : "Unavailable"}
            </Badge>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">Auto translate missing content</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Coming soon — runs stay manual until automation ships.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 cursor-not-allowed rounded-full border-border/70 opacity-55"
              disabled
              aria-disabled
            >
              Off
            </Button>
          </div>
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Workspace"
        description="Switch surface — filters and the table below apply to the tab you choose."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="flex flex-wrap gap-2 rounded-xl bg-muted/30 p-2 ring-1 ring-border/45">
          {VIEW_TABS.map((tab) => (
            <Button
              key={tab.key}
              asChild
              variant={view === tab.key ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-9 rounded-lg px-4 text-xs font-medium sm:text-sm",
                view === tab.key ? "shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Link
                href={translationsHref({
                  view: tab.key,
                  status:
                    tab.key === "bio"
                      ? bioStatusFilter
                      : taxLocStatusFilter,
                  q,
                  sort:
                    tab.key === "bio"
                      ? bioSort
                      : tab.key === "taxonomy"
                        ? taxonomySort
                        : locationSort,
                  dir: sortDir,
                })}
              >
                {tab.label}
              </Link>
            </Button>
          ))}
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Translation health"
        description="Jump to a queue or export gaps for QA. Secondary export adds stale talent bios; taxonomy and locations stay missing-only."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
        right={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-full text-xs shadow-sm">
              <a href="/api/admin/translations/export" download>
                <Download className="size-3.5" aria-hidden />
                Export gaps
              </a>
            </Button>
            <Button asChild variant="secondary" size="sm" className="h-9 rounded-full text-xs">
              <a
                href="/api/admin/translations/export?include=stale"
                download
                title="Missing-only export plus talent bios in stale state (taxonomy and locations unchanged)"
              >
                + Stale bios
              </a>
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          <SummaryCard
            label="Missing Spanish"
            count={countMissing ?? 0}
            href={`/admin/translations?${sq("missing")}`}
            active={view === "bio" && bioStatusFilter === "missing"}
            tone="red"
          />
          <SummaryCard
            label="Stale Spanish"
            count={countStale ?? 0}
            href={`/admin/translations?${sq("stale")}`}
            active={view === "bio" && bioStatusFilter === "stale"}
            tone="orange"
          />
          <SummaryCard
            label="Draft pending"
            count={countDraft ?? 0}
            href={`/admin/translations?${sq("draft")}`}
            active={view === "bio" && bioStatusFilter === "draft"}
            tone="amber"
          />
          <SummaryCard
            label="Approved"
            count={countApproved ?? 0}
            href={`/admin/translations?${sq("approved")}`}
            active={view === "bio" && bioStatusFilter === "approved"}
            tone="green"
          />
          <SummaryCard
            label="Taxonomy missing"
            count={taxonomyMissingCount}
            href={translationsHref({
              view: "taxonomy",
              status: "needs_attention",
              q,
              sort: view === "taxonomy" ? taxonomySort : undefined,
              dir: sortDir,
            })}
            active={view === "taxonomy" && (taxLocStatusFilter === "needs_attention" || taxLocStatusFilter === "missing")}
            tone="violet"
          />
          <SummaryCard
            label="Locations missing"
            count={locationMissingCount}
            href={translationsHref({
              view: "locations",
              status: "needs_attention",
              q,
              sort: view === "locations" ? locationSort : undefined,
              dir: sortDir,
            })}
            active={view === "locations" && (taxLocStatusFilter === "needs_attention" || taxLocStatusFilter === "missing")}
            tone="slate"
          />
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Spanish coverage"
        description="Share of rows with non-empty Spanish text — not the same as bio workflow status (missing/stale/draft). Use the health cards for workflow signals."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="space-y-3">
          <TranslationProgressRow
            label="Talent bios (published Spanish)"
            done={countProfilesWithEs}
            total={countProfilesTotal}
          />
          <TranslationProgressRow
            label="Taxonomy terms"
            done={countTaxonomyWithEs}
            total={countTaxonomyTotal}
          />
          <TranslationProgressRow
            label="Locations"
            done={countLocationsWithEs}
            total={countLocationsTotal}
          />
        </div>
      </DashboardSectionCard>

      {view === "bio" ? (
        <>
          <DashboardSectionCard
            title="Bio ES filters"
            description="Narrow the talent list. Search matches display name or profile code."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {BIO_STATUS_FILTERS.map((f) => (
                    <Button
                      key={f.key}
                      asChild
                      variant={bioStatusFilter === f.key ? "secondary" : "outline"}
                      size="sm"
                      className="h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs"
                    >
                      <Link href={translationsHref({ view: "bio", status: f.key, q, sort: bioSort, dir: sortDir })}>
                        {f.label}
                        {f.key === "missing" && countMissing != null ? (
                          <Badge variant="outline" className="h-5 border-border/60 px-1.5 font-mono text-[10px]">
                            {countMissing}
                          </Badge>
                        ) : null}
                        {f.key === "stale" && countStale != null ? (
                          <Badge variant="outline" className="h-5 border-border/60 px-1.5 font-mono text-[10px]">
                            {countStale}
                          </Badge>
                        ) : null}
                        {f.key === "draft" && countDraft != null ? (
                          <Badge variant="outline" className="h-5 border-border/60 px-1.5 font-mono text-[10px]">
                            {countDraft}
                          </Badge>
                        ) : null}
                        {f.key === "needs_attention" && countNeedsAttention != null ? (
                          <Badge variant="outline" className="h-5 border-border/60 px-1.5 font-mono text-[10px]">
                            {countNeedsAttention}
                          </Badge>
                        ) : null}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
              <form
                className="flex w-full max-w-md flex-col gap-2 lg:shrink-0 lg:items-end"
                action="/admin/translations"
                method="get"
              >
                <input type="hidden" name="view" value="bio" />
                {bioStatusFilter !== "all" ? <input type="hidden" name="status" value={bioStatusFilter} /> : null}
                {bioSort !== "name" ? <input type="hidden" name="sort" value={bioSort} /> : null}
                {sortDir !== "asc" ? <input type="hidden" name="dir" value={sortDir} /> : null}
                <label className="w-full text-xs font-medium text-muted-foreground">
                  Search
                  <Input
                    name="q"
                    defaultValue={q}
                    placeholder="Name or profile code"
                    className={cn("mt-1", ADMIN_FORM_CONTROL)}
                  />
                </label>
                <Button type="submit" size="sm" variant="secondary" className="w-full rounded-lg sm:w-auto">
                  Search
                </Button>
              </form>
            </div>
          </DashboardSectionCard>

          {talentRows.length > 0 ? (
            <TranslationsBioWorkflowTable
              rows={talentRows}
              auditByTalentId={auditByTalentId}
              statusFilter={bioStatusFilter}
              q={q}
              bioSort={bioSort}
              sortDir={sortDir}
              openNextMissingHref={openNextMissingHref}
              aiConfigured={aiConfigured}
            />
          ) : (
            <div className="px-1 py-4">
              {bioStatusFilter === "missing" && !q ? (
                <TranslationsEmptyState
                  title="All Spanish translations are complete"
                  description="No talent profiles are in the “missing” state right now. Use another filter or search if you expected rows here."
                >
                  <Button asChild variant="outline" size="sm">
                    <Link href={translationsHref({ view: "bio", status: "needs_attention", q, sort: bioSort, dir: sortDir })}>
                      Needs attention
                    </Link>
                  </Button>
                </TranslationsEmptyState>
              ) : bioStatusFilter === "stale" && !q ? (
                <TranslationsEmptyState
                  title="No stale translations"
                  description="English has not outpaced Spanish for any loaded profile under this filter."
                >
                  <Button asChild variant="outline" size="sm">
                    <Link href={translationsHref({ view: "bio", status: "all", sort: bioSort, dir: sortDir })}>
                      All profiles
                    </Link>
                  </Button>
                </TranslationsEmptyState>
              ) : q || bioStatusFilter !== "all" ? (
                <TranslationsEmptyState
                  title="No profiles match"
                  description="Try clearing the search box or switching filters to see more rows."
                >
                  <Button asChild variant="outline" size="sm">
                    <Link href={translationsHref({ view: "bio", status: "all" })}>Reset filters</Link>
                  </Button>
                </TranslationsEmptyState>
              ) : (
                <TranslationsEmptyState
                  title="No talent profiles"
                  description="Published talent will appear here once profiles exist in the directory."
                />
              )}
            </div>
          )}
        </>
      ) : null}

      {view === "taxonomy" ? (
        <div className="space-y-5">
          <DashboardSectionCard
            title="Taxonomy ES filters"
            description="Filter terms on this page. For full term editing, open Taxonomy admin."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  {TAX_LOC_STATUS_FILTERS.map((f) => (
                    <Button
                      key={f.key}
                      asChild
                      variant={taxLocStatusFilter === f.key ? "secondary" : "outline"}
                      size="sm"
                      className="h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs"
                    >
                      <Link
                        href={translationsHref({
                          view: "taxonomy",
                          status: f.key,
                          q,
                          sort: taxonomySort,
                          dir: sortDir,
                        })}
                      >
                        {f.label}
                        {(f.key === "needs_attention" || f.key === "missing") && countTaxonomyGaps != null ? (
                          <Badge variant="outline" className="h-5 border-border/60 px-1.5 font-mono text-[10px]">
                            {countTaxonomyGaps}
                          </Badge>
                        ) : null}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
              <form
                className="flex w-full max-w-md flex-col gap-2 lg:shrink-0 lg:items-end"
                action="/admin/translations"
                method="get"
              >
                <input type="hidden" name="view" value="taxonomy" />
                {taxLocStatusFilter !== "all" ? (
                  <input type="hidden" name="status" value={taxLocStatusFilter} />
                ) : null}
                {taxonomySort !== "kind" ? <input type="hidden" name="sort" value={taxonomySort} /> : null}
                {sortDir !== "asc" ? <input type="hidden" name="dir" value={sortDir} /> : null}
                <label className="w-full text-xs font-medium text-muted-foreground">
                  Search (English name or slug)
                  <Input
                    name="q"
                    defaultValue={q}
                    placeholder="Filter by name or slug…"
                    className={cn("mt-1", ADMIN_FORM_CONTROL)}
                  />
                </label>
                <Button type="submit" size="sm" variant="secondary" className="w-full rounded-lg sm:w-auto">
                  Search
                </Button>
              </form>
            </div>
          </DashboardSectionCard>

          <p className="rounded-xl border border-border/40 bg-muted/15 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            Bulk “Mark translated” copies the English label into Spanish when Spanish is empty. Refine wording in{" "}
            <Link
              href={q ? `/admin/taxonomy?q=${encodeURIComponent(q)}` : "/admin/taxonomy"}
              className="font-medium text-foreground underline decoration-[var(--impronta-gold)]/50 underline-offset-4 hover:decoration-[var(--impronta-gold)]"
            >
              Taxonomy
            </Link>
            .
          </p>

          {taxonomyWorkflowRows.length > 0 ? (
            <TranslationsTaxonomyWorkflowTable
              rows={taxonomyWorkflowRows}
              statusFilter={taxLocStatusFilter}
              q={q}
              taxonomySort={taxonomySort}
              sortDir={sortDir}
              openNextMissingHref={openNextTaxonomyMissingHref}
              aiConfigured={aiConfigured}
            />
          ) : (
            <div className="px-1 py-4">
              {(taxLocStatusFilter === "needs_attention" || taxLocStatusFilter === "missing") && !q ? (
                <TranslationsEmptyState
                  title="All taxonomy labels translated"
                  description="No terms are missing Spanish under this filter (among the first 500 loaded)."
                >
                  <Button asChild variant="outline" size="sm">
                    <Link href={translationsHref({ view: "taxonomy", status: "all", sort: taxonomySort, dir: sortDir })}>
                      All terms
                    </Link>
                  </Button>
                </TranslationsEmptyState>
              ) : q || taxLocStatusFilter !== "all" ? (
                <TranslationsEmptyState
                  title="No terms match"
                  description="Try clearing search or switching filters."
                >
                  <Button asChild variant="outline" size="sm">
                    <Link href={translationsHref({ view: "taxonomy", status: "all", sort: taxonomySort, dir: sortDir })}>
                      Reset filters
                    </Link>
                  </Button>
                </TranslationsEmptyState>
              ) : (
                <TranslationsEmptyState
                  title="No taxonomy terms loaded"
                  description="Terms will appear here once they exist in the catalog."
                />
              )}
            </div>
          )}
        </div>
      ) : null}

      {view === "locations" ? (
        <div className="space-y-5">
          <DashboardSectionCard
            title="Location ES filters"
            description="Filter cities on this page. For full location editing, open Locations admin."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  {TAX_LOC_STATUS_FILTERS.map((f) => (
                    <Button
                      key={f.key}
                      asChild
                      variant={taxLocStatusFilter === f.key ? "secondary" : "outline"}
                      size="sm"
                      className="h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs"
                    >
                      <Link
                        href={translationsHref({
                          view: "locations",
                          status: f.key,
                          q,
                          sort: locationSort,
                          dir: sortDir,
                        })}
                      >
                        {f.label}
                        {(f.key === "needs_attention" || f.key === "missing") && countLocationGaps != null ? (
                          <Badge variant="outline" className="h-5 border-border/60 px-1.5 font-mono text-[10px]">
                            {countLocationGaps}
                          </Badge>
                        ) : null}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
              <form
                className="flex w-full max-w-md flex-col gap-2 lg:shrink-0 lg:items-end"
                action="/admin/translations"
                method="get"
              >
                <input type="hidden" name="view" value="locations" />
                {taxLocStatusFilter !== "all" ? (
                  <input type="hidden" name="status" value={taxLocStatusFilter} />
                ) : null}
                {locationSort !== "country" ? <input type="hidden" name="sort" value={locationSort} /> : null}
                {sortDir !== "asc" ? <input type="hidden" name="dir" value={sortDir} /> : null}
                <label className="w-full text-xs font-medium text-muted-foreground">
                  Search (English name, slug, or country)
                  <Input
                    name="q"
                    defaultValue={q}
                    placeholder="Filter…"
                    className={cn("mt-1", ADMIN_FORM_CONTROL)}
                  />
                </label>
                <Button type="submit" size="sm" variant="secondary" className="w-full rounded-lg sm:w-auto">
                  Search
                </Button>
              </form>
            </div>
          </DashboardSectionCard>

          <p className="rounded-xl border border-border/40 bg-muted/15 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            Bulk “Mark translated” copies the English display name into Spanish when Spanish is empty. Refine wording in{" "}
            <Link
              href={q ? `/admin/locations?q=${encodeURIComponent(q)}` : "/admin/locations"}
              className="font-medium text-foreground underline decoration-[var(--impronta-gold)]/50 underline-offset-4 hover:decoration-[var(--impronta-gold)]"
            >
              Locations
            </Link>
            .
          </p>

          {locationWorkflowRows.length > 0 ? (
            <TranslationsLocationWorkflowTable
              rows={locationWorkflowRows}
              statusFilter={taxLocStatusFilter}
              q={q}
              locationSort={locationSort}
              sortDir={sortDir}
              openNextMissingHref={openNextLocationMissingHref}
              aiConfigured={aiConfigured}
            />
          ) : (
            <div className="px-1 py-4">
              {(taxLocStatusFilter === "needs_attention" || taxLocStatusFilter === "missing") && !q ? (
                <TranslationsEmptyState
                  title="All locations translated"
                  description="No cities are missing Spanish under this filter (among the first 500 loaded)."
                >
                  <Button asChild variant="outline" size="sm">
                    <Link href={translationsHref({ view: "locations", status: "all", sort: locationSort, dir: sortDir })}>
                      All locations
                    </Link>
                  </Button>
                </TranslationsEmptyState>
              ) : q || taxLocStatusFilter !== "all" ? (
                <TranslationsEmptyState
                  title="No locations match"
                  description="Try clearing search or switching filters."
                >
                  <Button asChild variant="outline" size="sm">
                    <Link href={translationsHref({ view: "locations", status: "all", sort: locationSort, dir: sortDir })}>
                      Reset filters
                    </Link>
                  </Button>
                </TranslationsEmptyState>
              ) : (
                <TranslationsEmptyState
                  title="No locations loaded"
                  description="Locations will appear here from the directory catalog."
                />
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
