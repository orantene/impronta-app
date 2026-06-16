import { CLIENT_ERROR, isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { healthAsymmetricBioEsTarget } from "@/lib/translation-center/health/asymmetric-bio";
import { buildTranslationUnitInlineEdit } from "@/lib/translation-center/editor-contract";
import type { TranslationCenterAdapter, AdapterContext } from "@/lib/translation-center/adapters/adapter-types";
import { TC_AGGREGATE_LIST_CAP, TC_TABLE_PAGE_SIZE } from "@/lib/translation-center/adapters/adapter-types";
import type {
  DomainAggregateDTO,
  ListUnitsParams,
  ListUnitsResult,
  TranslationHealthState,
  TranslationUnitDTO,
} from "@/lib/translation-center/types";
import { canonicalBioEn } from "@/lib/translation/public-bio";
import { BIO_I18N_SELECT, flattenBioColumns, type BioI18nColumns } from "@/lib/translation/bio-i18n-columns";

function emptyDomainAggregate(domain: AdapterContext["domain"]): DomainAggregateDTO {
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

function bump(counts: DomainAggregateDTO["counts"], health: TranslationHealthState) {
  if (health === "missing") counts.missing += 1;
  else if (health === "complete") counts.complete += 1;
  else if (health === "needs_attention") counts.needs_attention += 1;
  else if (health === "language_issue") counts.language_issue += 1;
}

export const talentBioAdapter: TranslationCenterAdapter = {
  adapterId: "talentBio",

  async aggregate(ctx: AdapterContext): Promise<DomainAggregateDTO> {
    const { supabase, domain } = ctx;
    const base = emptyDomainAggregate(domain);

    const { data, error } = await supabase
      .from("talent_profiles")
      .select(
        `id, profile_code, display_name, workflow_status, ${BIO_I18N_SELECT}`,
      )
      .is("deleted_at", null)
      .limit(TC_AGGREGATE_LIST_CAP);

    if (error) {
      if (!isPostgrestMissingColumnError(error)) {
        logServerError("translation-center/talentBioAdapter/aggregate", error);
      }
      return base;
    }

    for (const row of data ?? []) {
      if ((row as { workflow_status?: string }).workflow_status !== "approved") continue;
      base.counts.applicableRequired += 1;
      const flat = flattenBioColumns(row as unknown as BioI18nColumns);
      const h = healthAsymmetricBioEsTarget({
        bio_en: flat.bio_en,
        short_bio: flat.short_bio,
        bio_es: flat.bio_es,
      });
      bump(base.counts, h.health);
      if (h.health !== "missing" && h.health !== "language_issue") {
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

    const orderCol =
      params.bioSort === "code"
        ? "profile_code"
        : params.bioSort === "es_at"
          ? "bio_updated_at_i18n->>es"
          : params.bioSort === "en_at"
            ? "bio_updated_at_i18n->>en"
            : "display_name";
    const ascending = params.sortDir === "asc";

    let query = supabase
      .from("talent_profiles")
      .select(
        `id, profile_code, display_name, workflow_status, ${BIO_I18N_SELECT}`,
      )
      .eq("workflow_status", "approved")
      .is("deleted_at", null)
      .order(orderCol, { ascending, nullsFirst: false })
      .order("profile_code", { ascending: true })
      .range(params.offset, params.offset + TC_TABLE_PAGE_SIZE - 1);

    const st = params.statusFilter;
    if (st === "missing") {
      query = query.or("bio_i18n->>es.is.null,bio_i18n->>es.eq.");
    } else if (st === "complete" || st === "translated" || st === "published") {
      query = query.not("bio_i18n->>es", "is", null).neq("bio_i18n->>es", "");
    }

    if (params.q.trim()) {
      const escaped = params.q.trim().replace(/[%_]/g, "\\$&");
      query = query.or(`display_name.ilike.%${escaped}%,profile_code.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) {
      if (!isPostgrestMissingColumnError(error)) {
        logServerError("translation-center/talentBioAdapter/list", error);
        return { units: [], hasMore: false, loadError: CLIENT_ERROR.loadPage };
      }
      return { units: [], hasMore: false, loadError: null };
    }

    const rows = (data ?? []) as Array<
      BioI18nColumns & {
        id: string;
        profile_code: string;
        display_name: string | null;
        workflow_status: string | null;
      }
    >;

    // Flatten each row's per-locale JSONB bio columns once, keyed by id.
    const flatById = new Map(rows.map((row) => [row.id, flattenBioColumns(row)]));

    const workRows =
      st === "needs_attention"
        ? rows.filter((row) => {
            const flat = flatById.get(row.id)!;
            const h = healthAsymmetricBioEsTarget({
              bio_en: flat.bio_en,
              short_bio: flat.short_bio,
              bio_es: flat.bio_es,
            });
            return h.health === "needs_attention";
          })
        : rows;

    let units: TranslationUnitDTO[] = workRows.map((row) => {
      const flat = flatById.get(row.id)!;
      const h = healthAsymmetricBioEsTarget({
        bio_en: flat.bio_en,
        short_bio: flat.short_bio,
        bio_es: flat.bio_es,
      });
      const en = canonicalBioEn(flat.bio_en, flat.short_bio);
      const adminHref = `/admin/talent/${row.id}#bio-translation`;
      return {
        domainId: domain.id,
        adapterId: domain.adapterId,
        entityType: "talent_profile",
        entityId: row.id,
        fieldKey: "bio",
        groupKey: domain.groupKey,
        contentClass: domain.contentClass,
        displayLabel: row.display_name?.trim() || row.profile_code,
        health: h.health,
        integrityFlags: h.integrityFlags,
        localeSummary: `ES: ${(flat.bio_es ?? "").trim() ? "✓" : "—"} · EN: ${en ? "✓" : "—"}`,
        updatedAt: flat.bio_es_updated_at ?? flat.bio_en_updated_at,
        adminHref,
        inlineEdit: buildTranslationUnitInlineEdit({ domain, open_full_editor_url: adminHref }),
      };
    });

    if (st === "language_issue" || st === "language_conflict") {
      units = units.filter((u) => u.health === "language_issue");
    } else if (st === "complete" || st === "translated" || st === "published") {
      units = units.filter((u) => u.health === "complete");
    } else if (st === "missing") {
      units = units.filter((u) => u.health === "missing");
    }

    const hasMore = rows.length === TC_TABLE_PAGE_SIZE;
    return { units, hasMore, loadError: null };
  },
};
