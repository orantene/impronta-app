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

export const locationDisplayAdapter: TranslationCenterAdapter = {
  adapterId: "locationDisplay",

  async aggregate(ctx: AdapterContext): Promise<DomainAggregateDTO> {
    const { supabase, domain } = ctx;
    const base = empty(domain);

    const PAGE = 500;
    const MAX = 20_000;
    let offset = 0;

    while (offset < MAX) {
      const { data, error } = await supabase
        .from("locations")
        .select("display_name_en, display_name_es")
        .is("archived_at", null)
        .order("country_code", { ascending: true })
        .order("display_name_en", { ascending: true })
        .range(offset, offset + PAGE - 1);

      if (error) {
        logServerError("translation-center/locationAdapter/aggregate", error);
        return base;
      }
      if (!data?.length) break;

      for (const row of data as { display_name_en: string; display_name_es: string | null }[]) {
        base.counts.applicableRequired += 1;
        const h = healthPairedColumnsEsTarget({
          source: row.display_name_en,
          target: row.display_name_es,
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
      params.locationSort === "display_es"
        ? "display_name_es"
        : params.locationSort === "slug"
          ? "city_slug"
          : params.locationSort === "updated"
            ? "updated_at"
            : params.locationSort === "display_en"
              ? "display_name_en"
              : "country_code";
    const ascending = params.sortDir === "asc";

    let lq = supabase
      .from("locations")
      .select("id, country_code, city_slug, display_name_en, display_name_es, updated_at")
      .is("archived_at", null)
      .order(orderCol, { ascending, nullsFirst: false })
      .order("country_code", { ascending: true })
      .order("display_name_en", { ascending: true })
      .range(params.offset, params.offset + TC_TABLE_PAGE_SIZE - 1);

    const st = params.statusFilter;
    if (st === "missing") {
      lq = lq.or("display_name_es.is.null,display_name_es.eq.");
    } else if (st === "complete" || st === "translated" || st === "published") {
      lq = lq.not("display_name_es", "is", null).neq("display_name_es", "");
    }
    if (params.q.trim()) {
      const escaped = params.q.trim().replace(/[%_]/g, "\\$&");
      lq = lq.or(
        `display_name_en.ilike.%${escaped}%,city_slug.ilike.%${escaped}%,country_code.ilike.%${escaped}%`,
      );
    }

    const { data, error } = await lq;
    if (error) {
      logServerError("translation-center/locationAdapter/list", error);
      return { units: [], hasMore: false, loadError: CLIENT_ERROR.loadPage };
    }

    let rows = (data ?? []) as Array<{
      id: string;
      country_code: string;
      city_slug: string;
      display_name_en: string;
      display_name_es: string | null;
      updated_at: string;
    }>;
    if (st === "complete" || st === "translated" || st === "published") {
      rows = rows.filter((r) => (r.display_name_es ?? "").trim().length > 0);
    }

    const units: TranslationUnitDTO[] = rows.map((row) => {
      const h = healthPairedColumnsEsTarget({
        source: row.display_name_en,
        target: row.display_name_es,
        sourceUpdatedAt: null,
        targetUpdatedAt: null,
        hasReliableTimestamps: false,
      });
      const adminHref = `/admin/locations`;
      return {
        domainId: domain.id,
        adapterId: domain.adapterId,
        entityType: "location",
        entityId: row.id,
        fieldKey: "display_name",
        groupKey: domain.groupKey,
        contentClass: domain.contentClass,
        displayLabel: `${row.country_code} · ${row.display_name_en}`,
        health: h.health,
        integrityFlags: h.integrityFlags,
        localeSummary: `ES: ${(row.display_name_es ?? "").trim() ? "✓" : "—"}`,
        updatedAt: row.updated_at,
        adminHref,
        inlineEdit: buildTranslationUnitInlineEdit({ domain, open_full_editor_url: adminHref }),
      };
    });

    const filtered =
      st === "language_issue" || st === "language_conflict"
        ? units.filter((u) => u.health === "language_issue")
        : st === "needs_attention"
          ? units.filter((u) => u.health === "needs_attention")
          : st === "complete" || st === "translated" || st === "published"
            ? units.filter((u) => u.health === "complete")
            : st === "missing"
              ? units.filter((u) => u.health === "missing")
              : units;

    return {
      units: filtered,
      hasMore: rows.length === TC_TABLE_PAGE_SIZE,
      loadError: null,
    };
  },
};
