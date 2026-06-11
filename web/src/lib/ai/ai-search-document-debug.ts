import type { SupabaseClient } from "@supabase/supabase-js";
import { readAiSearchDocFields } from "@/lib/field-engine/read-source-ai-search-doc";

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

  // Load AI-visible field contributors + gender gate via the field-engine read
  // seam (T2.5). Uses the same source as rebuildAiSearchDocument so debug and
  // rebuild agree on which fields contribute to the AI doc.
  let fieldLines: Array<{ key: string; label_en: string; value: string }> = [];
  let genderAiVisible = false;
  try {
    const fieldResult = await readAiSearchDocFields(supabase, talentProfileId);
    fieldLines = fieldResult.aiVisibleFields;
    genderAiVisible = fieldResult.genderAiVisible;
  } catch {
    // Fall through: no field_value contributors shown on error (non-critical in debug).
  }

  // Gender contributor — the gate comes from the field read; the VALUE is always
  // the profile column (column-backed field).
  if (
    genderAiVisible &&
    typeof p.gender === "string" &&
    p.gender.trim()
  ) {
    contributors.push({ source: "profile", detail: "Gender (canonical column, ai_visible)" });
  }

  for (const line of fieldLines) {
    contributors.push({
      source: "field_values",
      detail: `${line.key} (${line.label_en || line.key})`,
    });
  }

  return { storedDocument, hasEmbedding, contributors };
}
