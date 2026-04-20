import { getTenantScope } from "@/lib/saas/scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { healthLocaleRowField } from "@/lib/translation-center/health/locale-rows";
import { buildTranslationUnitInlineEdit } from "@/lib/translation-center/editor-contract";
import type { TranslationCenterAdapter, AdapterContext } from "@/lib/translation-center/adapters/adapter-types";
import { TC_AGGREGATE_LIST_CAP, TC_TABLE_PAGE_SIZE } from "@/lib/translation-center/adapters/adapter-types";
import type {
  DomainAggregateDTO,
  ListUnitsParams,
  ListUnitsResult,
  TranslationUnitDTO,
} from "@/lib/translation-center/types";

function empty(domain: AdapterContext["domain"]): DomainAggregateDTO {
  return {
    domainId: domain.id,
    title: domain.title,
    navTabKey: domain.navTabKey,
    contentClass: domain.contentClass,
    coverageWeight: domain.coverageWeight,
    counts: {
      missing: 0,
      complete: 0,
      needs_attention: 0,
      language_issue: 0,
      applicableRequired: 0,
      filledRequired: 0,
    },
  };
}

type PageRow = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  updated_at: string;
};

/** v1 pairing: same `slug` across `locale` rows (see plan: temporary until translation_group_id). */
export const cmsPageTitleAdapter: TranslationCenterAdapter = {
  adapterId: "cmsPageTitle",

  async aggregate(ctx: AdapterContext): Promise<DomainAggregateDTO> {
    const { supabase, domain } = ctx;
    const base = empty(domain);

    const scope = await getTenantScope();
    if (!scope) return base;
    const tenantId = scope.tenantId;

    const { data: enRows, error: enErr } = await supabase
      .from("cms_pages")
      .select("slug, title")
      .eq("tenant_id", tenantId)
      .eq("locale", "en")
      .limit(TC_AGGREGATE_LIST_CAP);

    if (enErr || !enRows?.length) {
      if (enErr) logServerError("translation-center/cmsPageTitleAdapter/aggregate", enErr);
      return base;
    }

    const { data: esRows, error: esErr } = await supabase
      .from("cms_pages")
      .select("slug, title, updated_at")
      .eq("tenant_id", tenantId)
      .eq("locale", "es")
      .limit(TC_AGGREGATE_LIST_CAP);

    if (esErr) {
      logServerError("translation-center/cmsPageTitleAdapter/aggregateEs", esErr);
      return base;
    }

    const esBySlug = new Map<string, { title: string; updated_at: string }>();
    for (const r of (esRows ?? []) as PageRow[]) {
      esBySlug.set(r.slug, { title: r.title ?? "", updated_at: r.updated_at });
    }

    for (const r of enRows as PageRow[]) {
      const t = (r.title ?? "").trim();
      if (!t) continue;
      base.counts.applicableRequired += 1;
      const peer = esBySlug.get(r.slug);
      const esTitle = (peer?.title ?? "").trim();
      const h = healthLocaleRowField({
        primaryLocaleValue: esTitle,
        fallbackLocaleValue: t,
        primaryUpdatedAt: peer?.updated_at ?? null,
        fallbackUpdatedAt: null,
        enablePeerStale: false,
      });
      if (h.health === "missing") base.counts.missing += 1;
      else if (h.health === "language_issue") base.counts.language_issue += 1;
      else if (h.health === "needs_attention") {
        base.counts.needs_attention += 1;
        base.counts.filledRequired += 1;
      } else if (h.health === "complete") {
        base.counts.complete += 1;
        base.counts.filledRequired += 1;
      }
    }

    return base;
  },

  async listUnits(ctx: AdapterContext, params: ListUnitsParams): Promise<ListUnitsResult> {
    const { supabase, domain } = ctx;
    if (params.navTabKey !== domain.navTabKey) {
      return { units: [], hasMore: false, loadError: null };
    }

    const scope = await getTenantScope();
    if (!scope) return { units: [], hasMore: false, loadError: null };
    const tenantId = scope.tenantId;

    const { data: enData, error: enError } = await supabase
      .from("cms_pages")
      .select("id, slug, title, updated_at")
      .eq("tenant_id", tenantId)
      .eq("locale", "en")
      .order("slug", { ascending: true })
      .range(params.offset, params.offset + TC_TABLE_PAGE_SIZE - 1);

    if (enError) {
      logServerError("translation-center/cmsPageTitleAdapter/list", enError);
      return { units: [], hasMore: false, loadError: CLIENT_ERROR.loadPage };
    }

    const slugs = (enData ?? []).map((r) => (r as PageRow).slug);
    const { data: esData } =
      slugs.length > 0
        ? await supabase
            .from("cms_pages")
            .select("slug, title, updated_at")
            .eq("tenant_id", tenantId)
            .eq("locale", "es")
            .in("slug", slugs)
        : { data: [] as PageRow[] };

    const esBySlug = new Map<string, PageRow>();
    for (const r of (esData ?? []) as PageRow[]) {
      esBySlug.set(r.slug, r);
    }

    const units: TranslationUnitDTO[] = (enData ?? []).map((raw) => {
      const row = raw as PageRow;
      const enTitle = (row.title ?? "").trim();
      const peer = esBySlug.get(row.slug);
      const esTitle = (peer?.title ?? "").trim();
      const h = healthLocaleRowField({
        primaryLocaleValue: esTitle,
        fallbackLocaleValue: enTitle,
        primaryUpdatedAt: peer?.updated_at ?? null,
        fallbackUpdatedAt: row.updated_at,
        enablePeerStale: false,
      });
      const adminHref = `/admin/site-settings/content/pages/${row.id}`;
      return {
        domainId: domain.id,
        adapterId: domain.adapterId,
        entityType: "cms_page",
        entityId: row.id,
        fieldKey: "title",
        groupKey: domain.groupKey,
        contentClass: domain.contentClass,
        displayLabel: `${row.slug} — ${enTitle || "(empty)"}`,
        health: h.health,
        integrityFlags: h.integrityFlags,
        localeSummary: `ES title: ${esTitle ? "✓" : "—"}`,
        updatedAt: peer?.updated_at ?? row.updated_at,
        adminHref,
        inlineEdit: buildTranslationUnitInlineEdit({ domain, open_full_editor_url: adminHref }),
      };
    });

    let filtered = units;
    const st = params.statusFilter;
    if (st === "missing") {
      filtered = units.filter((u) => u.health === "missing");
    } else if (st === "needs_attention") {
      filtered = units.filter((u) => u.health === "needs_attention");
    } else if (st === "complete" || st === "translated" || st === "published") {
      filtered = units.filter((u) => u.health === "complete");
    } else if (st === "language_issue" || st === "language_conflict") {
      filtered = units.filter((u) => u.health === "language_issue");
    }

    if (params.q.trim()) {
      const q = params.q.trim().toLowerCase();
      filtered = filtered.filter((u) => u.displayLabel.toLowerCase().includes(q));
    }

    return {
      units: filtered,
      hasMore: (enData ?? []).length === TC_TABLE_PAGE_SIZE,
      loadError: null,
    };
  },
};
