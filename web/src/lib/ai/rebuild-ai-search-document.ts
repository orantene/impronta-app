/**
 * Loads profile + taxonomy + ai_visible field values and persists `talent_profiles.ai_search_document`.
 * Call after profile, taxonomy, or field value mutations affecting public search semantics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAiSearchDocument,
  type AiSearchDocumentFieldLine,
  type AiSearchDocumentTaxonomyTerm,
} from "@/lib/ai/build-ai-search-document";
import { logServerError } from "@/lib/server/safe-error";

function stringifyFieldValue(row: {
  value_type: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_taxonomy_ids: string[] | null;
}): string | null {
  const vt = row.value_type;
  if (vt === "text" || vt === "textarea") return row.value_text?.trim() || null;
  if (vt === "number" && row.value_number != null && !Number.isNaN(row.value_number)) {
    return String(row.value_number);
  }
  if (vt === "boolean") return row.value_boolean === null ? null : row.value_boolean ? "Yes" : "No";
  if (vt === "date" && row.value_date) return row.value_date;
  if (vt === "taxonomy_single" || vt === "taxonomy_multi") {
    // Labels resolved separately if needed; store UUIDs as fallback
    const ids = row.value_taxonomy_ids ?? [];
    if (ids.length === 0) return null;
    return ids.join(", ");
  }
  if (vt === "location") return row.value_text?.trim() || null;
  return row.value_text?.trim() || null;
}

export async function rebuildAiSearchDocument(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<{ document: string | null; error?: string }> {
  try {
    const { data: profile, error: pErr } = await supabase
      .from("talent_profiles")
      .select("id, display_name, first_name, last_name, short_bio, bio_en, bio_es, height_cm, gender, residence_city_id")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (pErr) {
      logServerError("rebuildAiSearchDocument/profile", pErr);
      return { document: null, error: pErr.message };
    }
    if (!profile) {
      return { document: null, error: "Profile not found" };
    }

    const p = profile as Record<string, unknown>;
    let locationLabel: string | null = null;
    const rid = p.residence_city_id as string | null | undefined;
    if (rid) {
      const { data: loc } = await supabase
        .from("locations")
        .select("display_name_en, display_name_es")
        .eq("id", rid)
        .maybeSingle();
      if (loc) {
        const l = loc as { display_name_en?: string; display_name_es?: string | null };
        locationLabel =
          l.display_name_en?.trim() || (typeof l.display_name_es === "string" ? l.display_name_es.trim() : "") || null;
      }
    }

    const { data: assignRows } = await supabase
      .from("talent_profile_taxonomy")
      .select("taxonomy_term_id, is_primary")
      .eq("talent_profile_id", talentProfileId);

    const termIds = [...new Set((assignRows ?? []).map((r) => r.taxonomy_term_id))];
    let primaryTalentTypeLabel: string | null = null;
    if (termIds.length > 0) {
      const { data: termRows } = await supabase
        .from("taxonomy_terms")
        .select("id, kind, name_en, slug")
        .in("id", termIds)
        .eq("kind", "talent_type");
      const byId = new Map((termRows ?? []).map((t) => [t.id, t] as const));
      const primaryAssign = (assignRows ?? []).find((a) => a.is_primary && byId.get(a.taxonomy_term_id));
      const pick = primaryAssign ?? (assignRows ?? []).find((a) => byId.get(a.taxonomy_term_id));
      const term = pick ? byId.get(pick.taxonomy_term_id) : null;
      if (term) {
        primaryTalentTypeLabel = term.name_en?.trim() || term.slug || null;
      }
    }

    const { data: taxRows, error: taxErr } = await supabase
      .from("talent_profile_taxonomy")
      .select(
        `
        taxonomy_terms (
          kind,
          slug,
          name_en,
          name_es
        )
      `,
      )
      .eq("talent_profile_id", talentProfileId);

    if (taxErr) {
      logServerError("rebuildAiSearchDocument/taxonomy", taxErr);
    }

    const taxonomyTerms: AiSearchDocumentTaxonomyTerm[] = [];
    for (const row of taxRows ?? []) {
      const term = (row as { taxonomy_terms?: unknown }).taxonomy_terms;
      const t = (Array.isArray(term) ? term[0] : term) as
        | { kind: string; slug?: string | null; name_en: string; name_es?: string | null }
        | null
        | undefined;
      if (!t?.kind) continue;
      taxonomyTerms.push({
        kind: t.kind,
        slug: t.slug ?? null,
        name_en: t.name_en ?? "",
        name_es: t.name_es ?? null,
      });
    }

    const { data: fieldValueRows, error: fvErr } = await supabase
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

    if (fvErr) {
      logServerError("rebuildAiSearchDocument/field_values", fvErr);
    }

    const aiVisibleFields: AiSearchDocumentFieldLine[] = [];
    for (const fv of fieldValueRows ?? []) {
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
      const value = stringifyFieldValue(raw);
      if (!value) continue;
      aiVisibleFields.push({
        key: def.key,
        label_en: def.label_en ?? def.key,
        value,
      });
    }

    const { data: genderDef } = await supabase
      .from("field_definitions")
      .select("key, ai_visible")
      .eq("key", "gender")
      .eq("active", true)
      .is("archived_at", null)
      .maybeSingle();

    const genderForDoc =
      genderDef?.ai_visible && typeof p.gender === "string" && p.gender.trim() ? p.gender.trim() : null;

    const document = buildAiSearchDocument({
      displayName: (p.display_name as string | null) ?? null,
      firstName: (p.first_name as string | null) ?? null,
      lastName: (p.last_name as string | null) ?? null,
      primaryTalentTypeLabel,
      locationLabel,
      heightCm: (p.height_cm as number | null) ?? null,
      gender: genderForDoc,
      shortBio: (p.short_bio as string | null) ?? null,
      bioEn: (p.bio_en as string | null) ?? null,
      bioEs: (p.bio_es as string | null) ?? null,
      taxonomyTerms,
      aiVisibleFields,
    });

    const { error: upErr } = await supabase
      .from("talent_profiles")
      .update({
        ai_search_document: document || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", talentProfileId);

    if (upErr) {
      logServerError("rebuildAiSearchDocument/update", upErr);
      return { document: null, error: upErr.message };
    }

    return { document };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logServerError("rebuildAiSearchDocument", e);
    return { document: null, error: msg };
  }
}
