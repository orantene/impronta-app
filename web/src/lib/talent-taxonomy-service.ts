/**
 * Domain logic for talent ↔ taxonomy assignments.
 * Kept UI-free so it can back server actions today and MCP tools later.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { logServerError } from "@/lib/server/safe-error";

const TALENT_TYPE_KIND = "talent_type";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export type TenantTalentTypeRelationship = "primary_role" | "secondary_role";

export type TalentTypeTermLookupRow = {
  id: string;
  slug: string;
  name_en: string;
  kind: string;
  term_type: string | null;
  parent_id: string | null;
  is_active: boolean;
  archived_at: string | null;
};

export type TenantTaxonomyAvailabilitySetting = {
  taxonomy_term_id: string;
  is_enabled: boolean | null;
  allow_as_primary: boolean | null;
  allow_as_secondary: boolean | null;
};

export type TenantTalentTypeResolveResult =
  | { ok: true; termId: string; term: TalentTypeTermLookupRow; ancestors: TalentTypeTermLookupRow[] }
  | { ok: false; error: string };

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

function isTalentTypeTerm(term: TalentTypeTermLookupRow): boolean {
  return term.kind === TALENT_TYPE_KIND || term.term_type === "talent_type";
}

function unavailableLabel(term: TalentTypeTermLookupRow): string {
  return term.name_en || term.slug || "That category";
}

export function evaluateTenantTalentTypeAvailability(params: {
  term: TalentTypeTermLookupRow;
  ancestors: TalentTypeTermLookupRow[];
  settings: TenantTaxonomyAvailabilitySetting[];
  relationshipType: TenantTalentTypeRelationship;
}): { ok: true } | { ok: false; error: string } {
  const { term, ancestors, relationshipType } = params;
  if (!term.is_active || term.archived_at || !isTalentTypeTerm(term)) {
    return { ok: false, error: "That talent type is not available." };
  }

  const settingsByTermId = new Map(
    params.settings.map((setting) => [setting.taxonomy_term_id, setting] as const),
  );
  const chain = [term, ...ancestors].filter((node) =>
    ["talent_type", "category_group", "parent_category"].includes(node.term_type ?? ""),
  );

  for (const node of chain) {
    const setting = settingsByTermId.get(node.id);
    if (setting?.is_enabled === false) {
      return { ok: false, error: `${unavailableLabel(node)} is disabled for this workspace.` };
    }
  }

  const parentCategory = ancestors.find((node) => node.term_type === "parent_category");
  const gate = parentCategory ?? term;
  const gateSetting = settingsByTermId.get(gate.id);
  if (relationshipType === "primary_role" && gateSetting?.allow_as_primary === false) {
    return { ok: false, error: `${unavailableLabel(gate)} cannot be used as a primary talent type.` };
  }
  if (relationshipType === "secondary_role" && gateSetting?.allow_as_secondary === false) {
    return { ok: false, error: `${unavailableLabel(gate)} cannot be used as a secondary talent type.` };
  }

  return { ok: true };
}

async function fetchTalentTypeTermBySlugOrId(
  supabase: SupabaseClient,
  slugOrId: string,
): Promise<TenantTalentTypeResolveResult> {
  const value = slugOrId.trim();
  if (!value) return { ok: false, error: "Choose a talent type." };

  const query = supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en, kind, term_type, parent_id, is_active, archived_at")
    .eq("kind", TALENT_TYPE_KIND);

  const { data, error } = UUID_RE.test(value)
    ? await query.eq("id", value).maybeSingle()
    : await query.eq("slug", value).maybeSingle();

  if (error) {
    logServerError("talent-taxonomy/resolveTalentType", error);
    return { ok: false, error: "Could not load taxonomy term." };
  }
  if (!data) return { ok: false, error: `Unknown talent type: ${value}` };

  const term = data as TalentTypeTermLookupRow;
  if (!term.is_active || term.archived_at || !isTalentTypeTerm(term)) {
    return { ok: false, error: "That talent type is not available." };
  }
  return { ok: true, termId: term.id, term, ancestors: [] };
}

async function fetchTermAncestors(
  supabase: SupabaseClient,
  term: TalentTypeTermLookupRow,
): Promise<{ ok: true; ancestors: TalentTypeTermLookupRow[] } | { ok: false; error: string }> {
  const ancestors: TalentTypeTermLookupRow[] = [];
  let parentId = term.parent_id;
  for (let depth = 0; parentId && depth < 6; depth += 1) {
    const { data, error } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en, kind, term_type, parent_id, is_active, archived_at")
      .eq("id", parentId)
      .maybeSingle();
    if (error) {
      logServerError("talent-taxonomy/ancestors", error);
      return { ok: false, error: "Could not load taxonomy hierarchy." };
    }
    if (!data) break;
    const row = data as TalentTypeTermLookupRow;
    ancestors.push(row);
    parentId = row.parent_id;
  }
  return { ok: true, ancestors };
}

export async function resolveTenantTalentTypeTermId(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    slugOrId: string;
    relationshipType: TenantTalentTypeRelationship;
    enforceTenantAvailability?: boolean;
  },
): Promise<TenantTalentTypeResolveResult> {
  const termRes = await fetchTalentTypeTermBySlugOrId(supabase, params.slugOrId);
  if (!termRes.ok) return termRes;

  const ancestorsRes = await fetchTermAncestors(supabase, termRes.term);
  if (!ancestorsRes.ok) return ancestorsRes;
  const ancestors = ancestorsRes.ancestors;

  if (params.enforceTenantAvailability === false) {
    return { ...termRes, ancestors };
  }

  const ids = [termRes.term.id, ...ancestors.map((node) => node.id)];
  const { data: settings, error } = await supabase
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled, allow_as_primary, allow_as_secondary")
    .eq("tenant_id", params.tenantId)
    .in("taxonomy_term_id", ids);

  if (error) {
    logServerError("talent-taxonomy/tenantAvailability", error);
    return { ok: false, error: "Could not verify workspace taxonomy settings." };
  }

  const available = evaluateTenantTalentTypeAvailability({
    term: termRes.term,
    ancestors,
    settings: (settings ?? []) as TenantTaxonomyAvailabilitySetting[],
    relationshipType: params.relationshipType,
  });
  if (!available.ok) return available;

  return { ...termRes, ancestors };
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

  return undefined;
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
