import type { SupabaseClient } from "@supabase/supabase-js";

export type AiSearchDocumentDebugContributor = {
  source: string;
  detail: string;
};

export type AiSearchDocumentDebug = {
  storedDocument: string | null;
  hasEmbedding: boolean;
  contributors: AiSearchDocumentDebugContributor[];
};

/**
 * Admin-only: inspect persisted `ai_search_document`, embedding row, and which sources would
 * contribute under the same rules as `rebuildAiSearchDocument` (for drift checks).
 */
export async function loadAiSearchDocumentDebug(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<AiSearchDocumentDebug> {
  const contributors: AiSearchDocumentDebugContributor[] = [];

  const { data: profile } = await supabase
    .from("talent_profiles")
    .select(
      "ai_search_document, display_name, first_name, last_name, short_bio, bio_en, bio_es, height_cm, gender, residence_city_id",
    )
    .eq("id", talentProfileId)
    .maybeSingle();

  const storedDocument =
    typeof profile?.ai_search_document === "string" ? profile.ai_search_document : null;

  const { data: embRow } = await supabase
    .from("talent_embeddings")
    .select("talent_profile_id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();

  const hasEmbedding = Boolean(embRow?.talent_profile_id);

  if (!profile) {
    return { storedDocument, hasEmbedding, contributors };
  }

  const p = profile as Record<string, unknown>;
  if (p.display_name || p.first_name || p.last_name) {
    contributors.push({ source: "profile", detail: "Name (display_name / first + last)" });
  }

  const { data: assignRows } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id, is_primary")
    .eq("talent_profile_id", talentProfileId);
  const termIds = [...new Set((assignRows ?? []).map((r) => r.taxonomy_term_id))];
  if (termIds.length) {
    const { data: typeTerms } = await supabase
      .from("taxonomy_terms")
      .select("id")
      .in("id", termIds)
      .eq("kind", "talent_type");
    if ((typeTerms ?? []).length > 0) {
      contributors.push({ source: "taxonomy", detail: "Primary talent type" });
    }
  }

  const rid = p.residence_city_id as string | null | undefined;
  if (rid) {
    contributors.push({ source: "profile", detail: "Location (residence city label)" });
  }

  if (p.height_cm != null && p.height_cm !== "") {
    contributors.push({ source: "profile", detail: "Height (profile column)" });
  }

  const { data: genderDef } = await supabase
    .from("field_definitions")
    .select("key, ai_visible")
    .eq("key", "gender")
    .eq("active", true)
    .is("archived_at", null)
    .maybeSingle();

  if (
    genderDef?.ai_visible &&
    typeof p.gender === "string" &&
    p.gender.trim()
  ) {
    contributors.push({ source: "profile", detail: "Gender (canonical column, ai_visible)" });
  }

  if (typeof p.short_bio === "string" && p.short_bio.trim()) {
    contributors.push({ source: "profile", detail: "Short bio" });
  }
  if (typeof p.bio_en === "string" && p.bio_en.trim()) {
    contributors.push({ source: "profile", detail: "Bio (EN)" });
  }
  if (typeof p.bio_es === "string" && p.bio_es.trim()) {
    contributors.push({ source: "profile", detail: "Bio (ES)" });
  }

  const { data: taxRows } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_terms(kind)")
    .eq("talent_profile_id", talentProfileId);

  const kinds = new Set<string>();
  for (const row of taxRows ?? []) {
    const term = (row as { taxonomy_terms?: { kind?: string } | { kind?: string }[] | null })
      .taxonomy_terms;
    const t = Array.isArray(term) ? term[0] : term;
    if (t?.kind && t.kind !== "talent_type") kinds.add(t.kind);
  }
  for (const k of [...kinds].sort()) {
    contributors.push({ source: "taxonomy", detail: `Terms (kind: ${k})` });
  }

  const { data: fvRows } = await supabase
    .from("field_values")
    .select(
      `
      value_text,
      value_number,
      value_boolean,
      value_date,
      value_taxonomy_ids,
      field_definitions (
        key,
        label_en,
        value_type,
        ai_visible,
        internal_only,
        active,
        archived_at,
        public_visible,
        profile_visible
      )
    `,
    )
    .eq("talent_profile_id", talentProfileId);

  for (const fv of fvRows ?? []) {
    const fvRow = fv as Record<string, unknown>;
    const fd = fvRow.field_definitions;
    const def = (Array.isArray(fd) ? fd[0] : fd) as
      | {
          key: string;
          label_en: string;
          value_type: string;
          ai_visible: boolean;
          internal_only: boolean;
          active: boolean;
          archived_at: string | null;
          public_visible: boolean;
          profile_visible: boolean;
        }
      | null
      | undefined;
    if (!def?.key) continue;
    if (def.key === "gender") continue;
    if (!def.ai_visible || def.internal_only || !def.active || def.archived_at) continue;
    if (!def.public_visible || !def.profile_visible) continue;

    const raw = {
      value_type: def.value_type,
      value_text: fvRow.value_text as string | null,
      value_number: fvRow.value_number as number | null,
      value_boolean: fvRow.value_boolean as boolean | null,
      value_date: fvRow.value_date as string | null,
      value_taxonomy_ids: (fvRow.value_taxonomy_ids as string[] | null) ?? null,
    };
    const has =
      (raw.value_text?.trim() ?? "") ||
      raw.value_number != null ||
      raw.value_boolean != null ||
      (raw.value_date?.trim() ?? "") ||
      (raw.value_taxonomy_ids?.length ?? 0) > 0;
    if (has) {
      contributors.push({
        source: "field_values",
        detail: `${def.key} (${def.label_en || def.key})`,
      });
    }
  }

  return { storedDocument, hasEmbedding, contributors };
}
