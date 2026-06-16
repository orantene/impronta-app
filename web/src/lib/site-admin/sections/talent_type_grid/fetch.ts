import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { listTalentIdsOnTenantRoster } from "@/lib/saas/talent-roster";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Dynamic-mode category derivation.
 *
 * Tenant isolation (query-layer, NOT RLS-only):
 *   roster = listTalentIdsOnTenantRoster(tenantId)  → tenant's site-visible
 *   roster talent ids only; results are constrained `.in("talent_profile_id",
 *   roster)`. A profile off this tenant's roster can never contribute.
 *
 * Counts = distinct talent_profile_id per resolved term. No taxonomy fields
 * invented; uses taxonomy_terms.{id,name_en,name_es,term_type,parent_id}.
 */

export type DerivedCategory = {
  termId: string;
  label: string;
  count: number;
};

type TptRow = {
  talent_profile_id: string;
  taxonomy_term_id: string;
  taxonomy_terms:
    | {
        id: string;
        name_i18n: Record<string, string | null> | null;
        term_type: string | null;
        parent_id: string | null;
      }
    | {
        id: string;
        name_i18n: Record<string, string | null> | null;
        term_type: string | null;
        parent_id: string | null;
      }[]
    | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function fetchTenantTalentCategories(params: {
  tenantId: string;
  parentCategoryMode: boolean;
  selectedTermIds?: string[];
  maxItems: number;
  locale: string;
}): Promise<DerivedCategory[]> {
  const { tenantId, parentCategoryMode, selectedTermIds, maxItems, locale } =
    params;
  const supabase = createPublicSupabaseClient();
  if (!supabase || !tenantId) return [];

  try {
    const roster = await listTalentIdsOnTenantRoster(supabase, tenantId);
    if (roster.length === 0) return [];

    const { data, error } = await supabase
      .from("talent_profile_taxonomy")
      .select(
        `talent_profile_id, taxonomy_term_id,
         taxonomy_terms ( id, name_i18n, term_type, parent_id )`,
      )
      .in("talent_profile_id", roster);

    if (error) {
      logServerError("talent_type_grid/fetchTenantTalentCategories", error);
      return [];
    }

    // Group → distinct talent per resolved term (parent or leaf).
    const byTerm = new Map<
      string,
      { label: string; talents: Set<string> }
    >();
    const parentIds = new Set<string>();

    for (const r of (data ?? []) as TptRow[]) {
      const term = one(r.taxonomy_terms);
      if (!term) continue;
      // Only surface filterable disciplines.
      if (
        term.term_type !== "talent_type" &&
        term.term_type !== "parent_category"
      ) {
        continue;
      }
      if (parentCategoryMode && term.parent_id) {
        parentIds.add(term.parent_id);
        const slot =
          byTerm.get(term.parent_id) ??
          { label: "", talents: new Set<string>() };
        slot.talents.add(r.talent_profile_id);
        byTerm.set(term.parent_id, slot);
      } else {
        if (
          selectedTermIds &&
          selectedTermIds.length > 0 &&
          !selectedTermIds.includes(term.id)
        ) {
          continue;
        }
        const ti18n = term.name_i18n ?? {};
        const label =
          (locale === "es" ? ti18n.es : ti18n.en) ??
          ti18n.en ??
          "";
        const slot =
          byTerm.get(term.id) ?? { label, talents: new Set<string>() };
        if (!slot.label) slot.label = label;
        slot.talents.add(r.talent_profile_id);
        byTerm.set(term.id, slot);
      }
    }

    // Resolve parent labels when rolling up.
    if (parentCategoryMode && parentIds.size > 0) {
      const { data: parents } = await supabase
        .from("taxonomy_terms")
        .select("id, name_i18n")
        .in("id", [...parentIds]);
      for (const p of parents ?? []) {
        const slot = byTerm.get(p.id as string);
        if (slot) {
          const pi18n = (p as { name_i18n?: Record<string, string | null> | null }).name_i18n ?? {};
          slot.label =
            (locale === "es" ? pi18n.es : pi18n.en) ??
            pi18n.en ??
            slot.label;
        }
      }
      if (selectedTermIds && selectedTermIds.length > 0) {
        for (const key of [...byTerm.keys()]) {
          if (!selectedTermIds.includes(key)) byTerm.delete(key);
        }
      }
    }

    return [...byTerm.entries()]
      .filter(([, v]) => v.label.length > 0)
      .map(([termId, v]) => ({
        termId,
        label: v.label,
        count: v.talents.size,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, maxItems);
  } catch (error) {
    logServerError("talent_type_grid/fetchTenantTalentCategories", error);
    return [];
  }
}
