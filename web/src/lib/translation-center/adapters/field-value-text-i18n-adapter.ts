import type { SupabaseClient } from "@supabase/supabase-js";

import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getLanguageSettings } from "@/lib/language-settings/get-language-settings";
import { healthFieldValueI18n } from "@/lib/translation-center/health/messages";
import type { TranslationCenterAdapter, AdapterContext } from "@/lib/translation-center/adapters/adapter-types";
import { TC_AGGREGATE_LIST_CAP, TC_TABLE_PAGE_SIZE } from "@/lib/translation-center/adapters/adapter-types";
import { buildTranslationUnitInlineEdit } from "@/lib/translation-center/editor-contract";
import type {
  DomainAggregateDTO,
  ListUnitsParams,
  ListUnitsResult,
  TranslationUnitDTO,
} from "@/lib/translation-center/types";
import {
  readTranslationAggregateRows,
  readTranslationListRows,
} from "@/lib/field-engine/read-source-translation-i18n";

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

function readI18nMap(
  i18n: unknown,
  legacyText: string | null,
  defaultLocale: string,
  adminLocales: string[],
): { primary: string; perTarget: Record<string, string> } {
  const perTarget: Record<string, string> = {};
  for (const code of adminLocales) {
    if (code !== defaultLocale) perTarget[code] = "";
  }
  if (!i18n || typeof i18n !== "object" || Array.isArray(i18n)) {
    const t = (legacyText ?? "").trim();
    return { primary: t, perTarget };
  }
  const o = i18n as Record<string, unknown>;
  let primary = String(o[defaultLocale] ?? "").trim();
  if (!primary) primary = (legacyText ?? "").trim();
  for (const code of adminLocales) {
    if (code === defaultLocale) continue;
    perTarget[code] = String(o[code] ?? "").trim();
  }
  return { primary, perTarget };
}

function localeSummaryTargets(perTarget: Record<string, string>, targetLocales: string[]): string {
  if (targetLocales.length === 0) return "";
  return targetLocales.map((c) => `${c.toUpperCase()}: ${perTarget[c]?.trim() ? "✓" : "—"}`).join(" · ");
}

/** Local fallback guard used only by `translatableDefinitionIds` (legacy-column
 *  detection for `field_definitions.translatable`). The equivalent helper for the
 *  value-store reads has been moved to read-source-translation-i18n.ts. */
function isUndefinedColumn(err: unknown, columnSqlName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const msg = String(e.message ?? "");
  return e.code === "42703" && msg.includes(columnSqlName);
}

async function translatableDefinitionIds(supabase: SupabaseClient): Promise<{
  ids: string[];
  meta: Map<string, { key: string; label_en: string }>;
}> {
  const base = supabase
    .from("field_definitions")
    .select("id, key, label_en")
    .in("value_type", ["text", "textarea"])
    .is("archived_at", null);

  let { data, error } = await base.eq("translatable", true);
  if (error && isUndefinedColumn(error, "translatable")) {
    ({ data, error } = await supabase
      .from("field_definitions")
      .select("id, key, label_en")
      .in("value_type", ["text", "textarea"])
      .is("archived_at", null));
  }
  if (error || !data?.length) {
    if (error) logServerError("translation-center/fieldValueTextI18nAdapter/defs", error);
    return { ids: [], meta: new Map() };
  }
  const meta = new Map<string, { key: string; label_en: string }>();
  const ids: string[] = [];
  for (const row of data as { id: string; key: string; label_en: string }[]) {
    ids.push(row.id);
    meta.set(row.id, { key: row.key, label_en: row.label_en });
  }
  return { ids, meta };
}

// NOTE: The SELECT string constants previously defined here (FIELD_VALUES_AGGREGATE_SELECT_*,
// FIELD_VALUES_LIST_SELECT_*) have been moved into the read-source seam
// (read-source-translation-i18n.ts) as part of the T2.5b read-source wiring.
// The adapter now calls readTranslationAggregateRows / readTranslationListRows
// which route through the `translation` surface flag (currently `a`, schema-blocked
// for `b`). See read-source-translation-i18n.ts for the B-unblock plan.

export const fieldValueTextI18nAdapter: TranslationCenterAdapter = {
  adapterId: "fieldValueTextI18n",

  async aggregate(ctx: AdapterContext): Promise<DomainAggregateDTO> {
    const { supabase, domain } = ctx;
    const base = empty(domain);
    const lang = await getLanguageSettings(supabase);
    const defaultLc = lang.defaultLocale;
    const targetLocales = lang.adminLocales.filter((c) => c !== defaultLc);

    const { ids, meta } = await translatableDefinitionIds(supabase);
    if (ids.length === 0) return base;

    let aggRows: Awaited<ReturnType<typeof readTranslationAggregateRows>>;
    try {
      aggRows = await readTranslationAggregateRows(supabase, {
        defIds: ids,
        limit: TC_AGGREGATE_LIST_CAP,
      });
    } catch (err) {
      logServerError("translation-center/fieldValueTextI18nAdapter/aggregate", err);
      return base;
    }

    for (const row of aggRows) {
      const r = row;
      const tp = Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles;
      if (!tp || tp.deleted_at || tp.workflow_status !== "approved") continue;
      if (!meta.has(r.field_definition_id)) continue;
      const { primary, perTarget } = readI18nMap(r.value_i18n, r.value_text, defaultLc, lang.adminLocales);
      if (!primary) continue;
      base.counts.applicableRequired += 1;
      const h = healthFieldValueI18n(primary, perTarget, targetLocales);
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

    const lang = await getLanguageSettings(supabase);
    const defaultLc = lang.defaultLocale;
    const targetLocales = lang.adminLocales.filter((c) => c !== defaultLc);

    const { ids, meta } = await translatableDefinitionIds(supabase);
    if (ids.length === 0) {
      return { units: [], hasMore: false, loadError: null };
    }

    let listRows: Awaited<ReturnType<typeof readTranslationListRows>>;
    try {
      listRows = await readTranslationListRows(supabase, {
        defIds: ids,
        offset: params.offset,
        limit: TC_TABLE_PAGE_SIZE,
      });
    } catch (err) {
      logServerError("translation-center/fieldValueTextI18nAdapter/list", err);
      return { units: [], hasMore: false, loadError: CLIENT_ERROR.loadPage };
    }

    let units: TranslationUnitDTO[] = [];
    for (const row of listRows) {
      const tp = Array.isArray(row.talent_profiles) ? row.talent_profiles[0] : row.talent_profiles;
      if (!tp || tp.deleted_at || tp.workflow_status !== "approved") continue;
      const fd = meta.get(row.field_definition_id);
      if (!fd) continue;
      const { primary, perTarget } = readI18nMap(row.value_i18n, row.value_text, defaultLc, lang.adminLocales);
      const h = healthFieldValueI18n(primary, perTarget, targetLocales);
      const adminHref = `/admin/talent/${tp.id}`;
      units.push({
        domainId: domain.id,
        adapterId: domain.adapterId,
        entityType: "field_value",
        entityId: row.id,
        parentEntityId: row.talent_profile_id,
        fieldKey: fd.key,
        groupKey: domain.groupKey,
        contentClass: domain.contentClass,
        displayLabel: `${tp.display_name?.trim() || tp.profile_code} · ${fd.label_en}`,
        health: h.health,
        integrityFlags: h.integrityFlags,
        localeSummary: localeSummaryTargets(perTarget, targetLocales) || "—",
        updatedAt: null,
        adminHref,
        inlineEdit: buildTranslationUnitInlineEdit({ domain, open_full_editor_url: adminHref }),
      });
    }

    const st = params.statusFilter;
    if (st === "missing") {
      units = units.filter((u) => u.health === "missing");
    } else if (st === "needs_attention") {
      units = units.filter((u) => u.health === "needs_attention");
    } else if (st === "complete" || st === "translated" || st === "published") {
      units = units.filter((u) => u.health === "complete");
    } else if (st === "language_issue" || st === "language_conflict") {
      units = units.filter((u) => u.health === "language_issue");
    }

    if (params.q.trim()) {
      const q = params.q.trim().toLowerCase();
      units = units.filter((u) => u.displayLabel.toLowerCase().includes(q));
    }

    return { units, hasMore: listRows.length === TC_TABLE_PAGE_SIZE, loadError: null };
  },
};
