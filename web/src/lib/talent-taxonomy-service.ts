/**
 * Domain logic for talent ↔ taxonomy assignments.
 * Kept UI-free so it can back server actions today and MCP tools later.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

const TALENT_TYPE_KIND = "talent_type";

export type TaxonomyTermRow = {
  id: string;
  kind: string;
  archived_at: string | null;
};

export type TaxonomyMutationResult = { ok: true } | { ok: false; error: string };

async function fetchTerm(
  supabase: SupabaseClient,
  taxonomyTermId: string,
): Promise<{ ok: true; term: TaxonomyTermRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("taxonomy_terms")
    .select("id, kind, archived_at")
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
 * Assign a taxonomy term to a talent profile. For `talent_type` terms, marks the
 * new assignment as primary and clears primary on other talent types.
 */
export async function assignTaxonomyTermToProfile(
  supabase: SupabaseClient,
  params: { talentProfileId: string; taxonomyTermId: string },
): Promise<TaxonomyMutationResult> {
  const termRes = await fetchTerm(supabase, params.taxonomyTermId);
  if (!termRes.ok) return termRes;
  const { term } = termRes;

  if (term.kind === TALENT_TYPE_KIND) {
    const cleared = await clearPrimaryForTalentTypes(supabase, params.talentProfileId);
    if (cleared) return cleared;
  }

  const { error } = await supabase.from("talent_profile_taxonomy").upsert(
    {
      talent_profile_id: params.talentProfileId,
      taxonomy_term_id: params.taxonomyTermId,
      is_primary: term.kind === TALENT_TYPE_KIND,
    },
    { onConflict: "talent_profile_id,taxonomy_term_id" },
  );

  if (error) {
    logServerError("talent-taxonomy/assign", error);
    return { ok: false, error: "Could not save taxonomy." };
  }
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
      return { ok: true };
    }

    const ids = (remaining ?? []).map((r) => r.taxonomy_term_id);
    if (ids.length === 0) return { ok: true };

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

  return { ok: true };
}
