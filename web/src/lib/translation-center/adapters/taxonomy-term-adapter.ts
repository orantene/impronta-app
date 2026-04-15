import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { healthPairedColumnsEsTarget } from "@/lib/translation-center/health/paired";
import { buildTranslationUnitInlineEdit } from "@/lib/translation-center/editor-contract";
import type { TranslationCenterAdapter, AdapterContext } from "@/lib/translation-center/adapters/adapter-types";
import { TC_TABLE_PAGE_SIZE } from "@/lib/translation-center/adapters/adapter-types";
import type {
  DomainAggregateDTO,
  ListUnitsParams,
  ListUnitsResult,
  TranslationHealthState,
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

function bumpHealth(counts: DomainAggregateDTO["counts"], health: TranslationHealthState) {
  if (health === "missing") counts.missing += 1;
  else if (health === "complete") counts.complete += 1;
  else if (health === "needs_attention") counts.needs_attention += 1;
  else if (health === "language_issue") counts.language_issue += 1;
}

export const taxonomyTermNameAdapter: TranslationCenterAdapter = {
  adapterId: "taxonomyTermName",

  async aggregate(ctx: AdapterContext): Promise<DomainAggregateDTO> {
    const { supabase, domain } = ctx;
    const base = empty(domain);

    const PAGE = 500;
    const MAX = 20_000;
    let offset = 0;

    while (offset < MAX) {
      const { data, error } = await supabase
        .from("taxonomy_terms")
        .select("name_en, name_es")
        .is("archived_at", null)
        .order("kind", { ascending: true })
        .order("slug", { ascending: true })
        .range(offset, offset + PAGE - 1);

      if (error) {
        logServerError("translation-center/taxonomyAdapter/aggregate", error);
        return base;
      }
      if (!data?.length) break;

      for (const row of data as { name_en: string; name_es: string | null }[]) {
        base.counts.applicableRequired += 1;
        const h = healthPairedColumnsEsTarget({
          source: row.name_en,
          target: row.name_es,
          sourceUpdatedAt: null,
          targetUpdatedAt: null,
          hasReliableTimestamps: false,
        });
        bumpHealth(base.counts, h.health);
        if (h.health !== "missing" && h.health !== "language_issue") {
          base.counts.filledRequired += 1;
        }
      }

      if (data.length < PAGE) break;
      offset += PAGE;
    }

    return base;
  },

  async listUnits(ctx: AdapterContext, params: ListUnitsParams): Promise<ListUnitsResult> {
    const { supabase, domain } = ctx;
    if (params.navTabKey !== domain.navTabKey) {
      return { units: [], hasMore: false, loadError: null };
    }

    const orderCol =
      params.taxonomySort === "name_es"
        ? "name_es"
        : params.taxonomySort === "slug"
          ? "slug"
          : params.taxonomySort === "updated"
            ? "updated_at"
            : params.taxonomySort === "name_en"
              ? "name_en"
              : "kind";
    const ascending = params.sortDir === "asc";

    let tq = supabase
      .from("taxonomy_terms")
      .select("id, kind, slug, name_en, name_es, updated_at")
      .is("archived_at", null)
      .order(orderCol, { ascending, nullsFirst: false })
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("slug", { ascending: true })
      .range(params.offset, params.offset + TC_TABLE_PAGE_SIZE - 1);

    const st = params.statusFilter;
    if (st === "missing") {
      tq = tq.or("name_es.is.null,name_es.eq.");
    } else if (st === "complete" || st === "translated" || st === "published") {
      tq = tq.not("name_es", "is", null).neq("name_es", "");
    }

    if (params.q.trim()) {
      const escaped = params.q.trim().replace(/[%_]/g, "\\$&");
      tq = tq.or(`name_en.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }

    const { data, error } = await tq;
    if (error) {
      logServerError("translation-center/taxonomyAdapter/list", error);
      return { units: [], hasMore: false, loadError: CLIENT_ERROR.loadPage };
    }

    let rows = (data ?? []) as Array<{
      id: string;
      kind: string;
      slug: string;
      name_en: string;
      name_es: string | null;
      updated_at: string;
    }>;
    if (st === "complete" || st === "translated" || st === "published") {
      rows = rows.filter((r) => (r.name_es ?? "").trim().length > 0);
    }

    const units: TranslationUnitDTO[] = rows.map((row) => {
      const h = healthPairedColumnsEsTarget({
        source: row.name_en,
        target: row.name_es,
        sourceUpdatedAt: null,
        targetUpdatedAt: null,
        hasReliableTimestamps: false,
      });
      const adminHref = `/admin/taxonomy?q=${encodeURIComponent(row.slug)}`;
      return {
        domainId: domain.id,
        adapterId: domain.adapterId,
        entityType: "taxonomy_term",
        entityId: row.id,
        fieldKey: "name",
        groupKey: domain.groupKey,
        contentClass: domain.contentClass,
        displayLabel: `${row.kind}: ${row.name_en}`,
        health: h.health,
        integrityFlags: h.integrityFlags,
        localeSummary: `ES: ${(row.name_es ?? "").trim() ? "✓" : "—"}`,
        updatedAt: row.updated_at,
        adminHref,
        inlineEdit: buildTranslationUnitInlineEdit({ domain, open_full_editor_url: adminHref }),
      };
    });

    let filtered = units;
    if (st === "language_issue" || st === "language_conflict") {
      filtered = units.filter((u) => u.health === "language_issue");
    } else if (st === "needs_attention") {
      filtered = units.filter((u) => u.health === "needs_attention");
    } else if (st === "complete" || st === "translated" || st === "published") {
      filtered = units.filter((u) => u.health === "complete");
    } else if (st === "missing") {
      filtered = units.filter((u) => u.health === "missing");
    }

    return {
      units: filtered,
      hasMore: rows.length === TC_TABLE_PAGE_SIZE,
      loadError: null,
    };
  },
};
