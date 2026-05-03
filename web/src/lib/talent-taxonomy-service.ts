/**
 * Domain logic for talent ↔ taxonomy assignments.
 * Kept UI-free so it can back server actions today and MCP tools later.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { logServerError } from "@/lib/server/safe-error";

const TALENT_TYPE_KIND = "talent_type";

export type RelationshipType =
  | "primary_role"
  | "secondary_role"
  | "specialty"
  | "skill"
  | "context"
  | "credential"
  | "attribute";

export type TaxonomyTermRow = {
  id: string;
  kind: string;
  /**
   * Hierarchical type from the v2 taxonomy. May be null for legacy rows that
   * predate the term_type column.
   */
  term_type: string | null;
  archived_at: string | null;
};

export type TaxonomyMutationResult = { ok: true } | { ok: false; error: string };

/**
 * Maps a term's term_type to the default relationship_type used when no
 * caller override is provided. Talent types default to primary_role; the
 * caller can downgrade to secondary_role explicitly. Other term_types map
 * straight through.
 */
export function defaultRelationshipForTerm(termType: string | null, kind: string): RelationshipType {
  // Prefer term_type when set; fall back to kind for legacy rows.
  switch (termType) {
    case "talent_type":
      return "primary_role";
    case "specialty":
      return "specialty";
    case "skill":
      return "skill";
    case "context":
      return "context";
    case "credential":
      return "credential";
    case "attribute":
    case "language":
      return "attribute";
    default:
      // Legacy rows (no term_type yet): derive from kind.
      if (kind === "talent_type") return "primary_role";
      if (kind === "skill") return "skill";
      if (kind === "event_type" || kind === "industry") return "context";
      return "attribute";
  }
}

async function fetchTerm(
  supabase: SupabaseClient,
  taxonomyTermId: string,
): Promise<{ ok: true; term: TaxonomyTermRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("taxonomy_terms")
    .select("id, kind, term_type, archived_at")
    .eq("id", taxonomyTermId)
    .maybeSingle();

  if (error) {
    logServerError("talent-taxonomy/fetchTerm", error);
    return { ok: false, error: "Could not load taxonomy term." };
  }
  if (!data || data.archived_at) {
    return { ok: false, error: "That taxonomy term is not available." };
  }
  return { ok: true, term: data as TaxonomyTermRow };
}

async function clearPrimaryForTalentTypes(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<{ ok: false; error: string } | undefined> {
  const { data: rows, error: listErr } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("talent_profile_id", talentProfileId);

  if (listErr) {
    logServerError("talent-taxonomy/clearPrimary/list", listErr);
    return { ok: false, error: "Could not update taxonomy." };
  }

  const termIds = (rows ?? []).map((r) => r.taxonomy_term_id);
  if (termIds.length === 0) return;

  const { data: types, error: typeErr } = await supabase
    .from("taxonomy_terms")
    .select("id")
    .in("id", termIds)
    .eq("kind", TALENT_TYPE_KIND);

  if (typeErr) {
    logServerError("talent-taxonomy/clearPrimary/types", typeErr);
    return { ok: false, error: "Could not update taxonomy." };
  }

  const talentTypeIds = (types ?? []).map((t) => t.id);
  if (talentTypeIds.length === 0) return;

  const { error: updErr } = await supabase
    .from("talent_profile_taxonomy")
    .update({ is_primary: false })
    .eq("talent_profile_id", talentProfileId)
    .in("taxonomy_term_id", talentTypeIds);

  if (updErr) {
    logServerError("talent-taxonomy/clearPrimary/update", updErr);
    return { ok: false, error: "Could not update taxonomy." };
  }
}

/**
 * Assign a taxonomy term to a talent profile.
 *
 * Behavior:
 * - If `relationshipType` is omitted, it's derived from the term's term_type
 *   (or kind for legacy rows): talent_type → primary_role; skill → skill;
 *   etc. See `defaultRelationshipForTerm`.
 * - When the resolved relationship is `primary_role`, primary is cleared on
 *   any other talent_type assignments first to maintain the
 *   "one primary role per profile" invariant.
 * - The DB-side validator trigger (migration 20260801120100) will reject
 *   incompatible combinations (e.g. a skill term assigned as primary_role).
 */
export async function assignTaxonomyTermToProfile(
  supabase: SupabaseClient,
  params: {
    talentProfileId: string;
    taxonomyTermId: string;
    relationshipType?: RelationshipType;
  },
): Promise<TaxonomyMutationResult> {
  const termRes = await fetchTerm(supabase, params.taxonomyTermId);
  if (!termRes.ok) return termRes;
  const { term } = termRes;

  const relationshipType: RelationshipType =
    params.relationshipType ?? defaultRelationshipForTerm(term.term_type, term.kind);

  if (relationshipType === "primary_role") {
    const cleared = await clearPrimaryForTalentTypes(supabase, params.talentProfileId);
    if (cleared) return cleared;
  }

  const { error } = await supabase.from("talent_profile_taxonomy").upsert(
    {
      talent_profile_id: params.talentProfileId,
      taxonomy_term_id: params.taxonomyTermId,
      relationship_type: relationshipType,
      is_primary: relationshipType === "primary_role",
    },
    { onConflict: "talent_profile_id,taxonomy_term_id" },
  );

  if (error) {
    logServerError("talent-taxonomy/assign", error);
    return { ok: false, error: "Could not save taxonomy." };
  }
  await scheduleRebuildAiSearchDocument(supabase, params.talentProfileId);
  return { ok: true };
}

/**
 * Remove an assignment. If it was the primary talent type, promotes another
 * talent_type assignment when one exists.
 */
export async function removeTaxonomyTermFromProfile(
  supabase: SupabaseClient,
  params: { talentProfileId: string; taxonomyTermId: string },
): Promise<TaxonomyMutationResult> {
  const { data: existing, error: exErr } = await supabase
    .from("talent_profile_taxonomy")
    .select("is_primary, taxonomy_terms(kind)")
    .eq("talent_profile_id", params.talentProfileId)
    .eq("taxonomy_term_id", params.taxonomyTermId)
    .maybeSingle();

  if (exErr) {
    logServerError("talent-taxonomy/remove/fetch", exErr);
    return { ok: false, error: "Could not update taxonomy." };
  }
  if (!existing) return { ok: false, error: "That tag is not on your profile." };

  const tt = existing.taxonomy_terms as { kind: string } | { kind: string }[] | null;
  const kindRow = Array.isArray(tt) ? tt[0] : tt;
  const kind = kindRow?.kind ?? null;

  const { error: delErr } = await supabase
    .from("talent_profile_taxonomy")
    .delete()
    .eq("talent_profile_id", params.talentProfileId)
    .eq("taxonomy_term_id", params.taxonomyTermId);

  if (delErr) {
    logServerError("talent-taxonomy/remove/delete", delErr);
    return { ok: false, error: "Could not remove taxonomy." };
  }

  if (kind === TALENT_TYPE_KIND && existing.is_primary) {
    const { data: remaining, error: remErr } = await supabase
      .from("talent_profile_taxonomy")
      .select("taxonomy_term_id")
      .eq("talent_profile_id", params.talentProfileId);

    if (remErr) {
      logServerError("talent-taxonomy/remove/remaining", remErr);
      await scheduleRebuildAiSearchDocument(supabase, params.talentProfileId);
      return { ok: true };
    }

    const ids = (remaining ?? []).map((r) => r.taxonomy_term_id);
    if (ids.length === 0) {
      await scheduleRebuildAiSearchDocument(supabase, params.talentProfileId);
      return { ok: true };
    }

    const { data: tt, error: ttErr } = await supabase
      .from("taxonomy_terms")
      .select("id")
      .in("id", ids)
      .eq("kind", TALENT_TYPE_KIND)
      .limit(1)
      .maybeSingle();

    if (!ttErr && tt?.id) {
      await supabase
        .from("talent_profile_taxonomy")
        .update({ is_primary: true })
        .eq("talent_profile_id", params.talentProfileId)
        .eq("taxonomy_term_id", tt.id);
    }
  }

  await scheduleRebuildAiSearchDocument(supabase, params.talentProfileId);
  return { ok: true };
}
