import type { SupabaseClient } from "@supabase/supabase-js";

import { getCachedDirectoryFirstPage } from "@/lib/directory/cache";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";
import { logServerError } from "@/lib/server/safe-error";

export type InterpretFilterDraft = {
  taxonomyTermIds: string[];
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  /** From parsedIntent.gender_preference ("female" | "male" | ""). */
  genderPreference: string;
};

export type FinalizedInterpretFilters = {
  taxonomyTermIds: string[];
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  /** Which relaxation steps were applied ([] = the full interpretation held). */
  relaxationsApplied: string[];
  /** Result count of the returned configuration (null when probing failed). */
  resultCount: number | null;
};

/** Kinds that carry the primary "who" of a query — never relaxed away. */
const ROLE_KINDS = new Set(["talent_type", "parent_category", "category_group"]);
/** Softest structured signals — the first to go when the AND zeroes out. */
const SOFT_KINDS = new Set(["fit_label", "skill", "attribute", "language", "industry", "tag"]);

/**
 * Turn a validated+roster-pruned interpretation into filters that actually
 * RETURN results. The raw interpretation over-constrains in practice:
 *
 * 1. gender arrives as `gender_preference` but was only ever mapped to
 *    fit-label terms nobody tags — it now maps to the canonical `gender`
 *    column facet (`ff=gender:Woman|Man`, the same one the sidebar uses);
 * 2. residual free text ("promotional", "DJ for a beach club party") rides
 *    along as `q` and keyword-ANDs good term matches down to zero — when
 *    structured terms exist, the text is dropped (the AI summary chip still
 *    tells the visitor what was understood);
 * 3. the engine ANDs across kinds, so one over-eager fit-label/skill (or a
 *    hallucinated 173–177cm band) guarantees an empty page. We probe the
 *    real count (cached first-page read, limit 1) and relax stepwise —
 *    soft kinds → ranges → non-role terms — keeping role + location +
 *    gender, until something matches. If even the role-level query is
 *    honestly empty, the full interpretation is returned unrelaxed.
 *
 * Fail-open: any probe error returns the full interpretation untouched.
 */
export async function finalizeInterpretFilters(
  supabase: SupabaseClient,
  tenantId: string | null,
  locale: string,
  draft: InterpretFilterDraft,
): Promise<FinalizedInterpretFilters> {
  const gp = draft.genderPreference.trim().toLowerCase();
  const genderValues = gp === "female" ? ["Woman"] : gp === "male" ? ["Man"] : null;
  const fieldFacets: DirectoryFieldFacetSelection[] = genderValues
    ? [{ fieldKey: "gender", values: genderValues }]
    : [];

  const hasTerms = draft.taxonomyTermIds.length > 0;
  const base: FinalizedInterpretFilters = {
    taxonomyTermIds: draft.taxonomyTermIds,
    // Structured terms present → residual keyword text only subtracts.
    query: hasTerms ? "" : draft.query,
    locationSlug: draft.locationSlug,
    heightMinCm: draft.heightMinCm,
    heightMaxCm: draft.heightMaxCm,
    ageMin: draft.ageMin,
    ageMax: draft.ageMax,
    fieldFacets,
    relaxationsApplied: hasTerms && draft.query ? ["free_text_dropped"] : [],
    resultCount: null,
  };

  try {
    // Kind + parent lookup for the relaxation ladder and hierarchy collapse.
    const kindById = new Map<string, string>();
    const parentById = new Map<string, string | null>();
    if (hasTerms) {
      const { data, error } = await supabase
        .from("taxonomy_terms")
        .select("id, kind, parent_id")
        .in("id", draft.taxonomyTermIds);
      if (error) throw error;
      for (const r of data ?? []) {
        const row = r as { id: string; kind: string | null; parent_id: string | null };
        kindById.set(row.id, row.kind ?? "");
        parentById.set(row.id, row.parent_id);
      }
    }

    // Hierarchy collapse: when the model returns BOTH an ancestor and its
    // descendant ("dancer" + "latin-dancer"), the engine's leaf-only match
    // silently discards the ancestor's own direct tags — the pair returns
    // FEWER results than either alone. Keep the broader ancestor (its subtree
    // covers the descendant) and drop the descendant. Walk chains ≤6 hops,
    // fetching missing parents outside the interpreted set as needed.
    const idSet = new Set(draft.taxonomyTermIds);
    const dropDescendants = new Set<string>();
    for (const id of draft.taxonomyTermIds) {
      let cursor = parentById.get(id) ?? null;
      for (let hop = 0; hop < 6 && cursor; hop++) {
        if (idSet.has(cursor)) {
          dropDescendants.add(id);
          break;
        }
        if (!parentById.has(cursor)) {
          const { data: pRow } = await supabase
            .from("taxonomy_terms")
            .select("id, parent_id")
            .eq("id", cursor)
            .maybeSingle();
          parentById.set(cursor, (pRow as { parent_id: string | null } | null)?.parent_id ?? null);
        }
        cursor = parentById.get(cursor) ?? null;
      }
    }
    const collapsedTerms = draft.taxonomyTermIds.filter((id) => !dropDescendants.has(id));
    if (dropDescendants.size > 0) {
      base.taxonomyTermIds = collapsedTerms;
      base.relaxationsApplied = [...base.relaxationsApplied, "hierarchy_collapsed"];
    }

    const softTerms = collapsedTerms.filter((id) => SOFT_KINDS.has(kindById.get(id) ?? ""));
    const nonRoleTerms = collapsedTerms.filter(
      (id) => !ROLE_KINDS.has(kindById.get(id) ?? ""),
    );
    const roleTerms = collapsedTerms.filter((id) => ROLE_KINDS.has(kindById.get(id) ?? ""));
    const hasRanges =
      draft.heightMinCm != null ||
      draft.heightMaxCm != null ||
      draft.ageMin != null ||
      draft.ageMax != null;

    const probe = async (c: FinalizedInterpretFilters): Promise<number> => {
      // Classic engine ONLY — the grid fetches /api/directory (classic) when
      // the AI leaves no residual q, so probing the AI-hybrid path would
      // approve configurations the grid then renders as empty.
      const page = await getCachedDirectoryFirstPage({
        taxonomyTermIds: c.taxonomyTermIds,
        limit: 1,
        locale,
        query: c.query || undefined,
        locationSlug: c.locationSlug || undefined,
        sort: "recommended",
        heightMinCm: c.heightMinCm,
        heightMaxCm: c.heightMaxCm,
        ageMin: c.ageMin,
        ageMax: c.ageMax,
        fieldFacetFilters: c.fieldFacets,
        tenantId,
      });
      return page.totalCount ?? page.items.length;
    };

    // Relaxation ladder: each step keeps role terms + location + gender.
    const ladder: Array<{ step: string; patch: Partial<FinalizedInterpretFilters> }> = [];
    if (softTerms.length > 0) {
      ladder.push({
        step: "soft_terms_dropped",
        patch: {
          taxonomyTermIds: collapsedTerms.filter((id) => !softTerms.includes(id)),
        },
      });
    }
    if (hasRanges) {
      ladder.push({
        step: "ranges_dropped",
        patch: { heightMinCm: null, heightMaxCm: null, ageMin: null, ageMax: null },
      });
    }
    if (nonRoleTerms.length > 0 && roleTerms.length > 0) {
      ladder.push({ step: "non_role_terms_dropped", patch: { taxonomyTermIds: roleTerms } });
    }

    let current = base;
    let count = await probe(current);
    if (count > 0) return { ...current, resultCount: count };

    for (const { step, patch } of ladder) {
      const candidate: FinalizedInterpretFilters = {
        ...current,
        ...patch,
        relaxationsApplied: [...current.relaxationsApplied, step],
      };
      count = await probe(candidate);
      current = candidate;
      if (count > 0) return { ...current, resultCount: count };
    }

    // Last resort: role terms can zero out even together (the engine's leaf
    // expansion descends into a sibling term's skill-kind children, which
    // then AND as a separate group — "dancer + latin-dancer" < "dancer").
    // Try each role term alone and keep the first that matches.
    if (roleTerms.length > 1) {
      for (const termId of roleTerms) {
        const candidate: FinalizedInterpretFilters = {
          ...current,
          taxonomyTermIds: [termId],
          relaxationsApplied: [...current.relaxationsApplied, "role_terms_reduced"],
        };
        count = await probe(candidate);
        if (count > 0) return { ...candidate, resultCount: count };
      }
    }

    // Everything is honestly empty → surface the FULL interpretation so the
    // visitor sees exactly what was asked for (and the honest empty state).
    return { ...base, resultCount: 0 };
  } catch (e) {
    logServerError("ai/finalize-interpret-filters", e);
    return base;
  }
}
