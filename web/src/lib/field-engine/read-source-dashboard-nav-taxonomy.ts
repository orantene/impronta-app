// src/lib/field-engine/read-source-dashboard-nav-taxonomy.ts
//
// T2.3 — taxonomy-editor editableFields reader pair for the `dashboard_nav`
// surface. Split from read-source-dashboard-nav.ts to stay under the 800-line
// ESLint max-lines limit.
//
// See read-source-dashboard-nav.ts for the full parity analysis and documented
// diffs. This file owns the `taxonomyEditableFieldsReaderPair` and the
// `readDashboardTaxonomyEditableFields` public entry point.
//
// PARITY NOTE: The taxonomy editor (`loadTalentTaxonomyEditorData`) shows A's
// 7 taxonomy keys (talent_type, skills, languages, fit_labels, industries,
// event_types, tags). B produces 5 (talent_type has no B row; skills is
// deprecated in B). Dropping talent_type + skills from the taxonomy editor
// governance list is NON-REGRESSIVE — talent_type is managed by the tenant
// admin (not talent self-service) and skills is deprecated.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import type { DashboardNavEditableTaxonomyFields } from "@/lib/field-engine/read-source-dashboard-nav";

// ── Taxonomy-field skeleton (STATIC — System A registry retired) ──────────────
//
// T3.2 — repointed off legacy System A `field_definitions`. The taxonomy editor's
// per-field governance metadata (`taxonomy_kind`, intra-group `sort_order`, the
// owning group's `group_sort_order`, and fallback EN/ES labels) came from the
// FROZEN System-A registry; it never lived in the value store. We pin it as a
// code-level constant captured 1:1 from prod (ref pluhdapdnuiulvxmyspd,
// 2026-06-11) using the SAME gate the A-reader applied. WHETHER each field appears
// is still decided at runtime by querying System B (`profile_field_definitions`)
// for a live (non-deprecated, talent-editable) row — the static map only supplies
// the governance metadata, never a liveness verdict. `talent_type` (no B row) +
// `skills` (deprecated in B) are documented drops; the surviving five
// (`fit_labels`, `tags`, `languages`, `industries`, `event_types`) gate on B.

type TaxonomyFieldSkeleton = {
  key: string;
  label_en: string;
  label_es: string | null;
  taxonomy_kind: string;
  sort_order: number;
  group_sort_order: number;
};

const TAXONOMY_FIELD_SKELETON: readonly TaxonomyFieldSkeleton[] = [
  { key: "talent_type", label_en: "Talent Type", label_es: "Tipo de talento", taxonomy_kind: "talent_type", sort_order: 10, group_sort_order: 20 },
  { key: "skills", label_en: "Skills", label_es: "Habilidades", taxonomy_kind: "skill", sort_order: 30, group_sort_order: 30 },
  { key: "languages", label_en: "Languages", label_es: "Idiomas", taxonomy_kind: "language", sort_order: 70, group_sort_order: 30 },
  { key: "tags", label_en: "Tags", label_es: "Etiquetas", taxonomy_kind: "tag", sort_order: 20, group_sort_order: 40 },
  { key: "industries", label_en: "Industries", label_es: "Industrias", taxonomy_kind: "industry", sort_order: 40, group_sort_order: 50 },
  { key: "event_types", label_en: "Event Types", label_es: "Tipos de evento", taxonomy_kind: "event_type", sort_order: 50, group_sort_order: 60 },
  { key: "fit_labels", label_en: "Fit Labels", label_es: "Etiquetas de ajuste", taxonomy_kind: "fit_label", sort_order: 60, group_sort_order: 60 },
] as const;

// ── Taxonomy editableFields reader (System B liveness + static metadata) ──────
//
// Reads System B `profile_field_definitions` for the 5 direct-match taxonomy keys
// that survive in B (`fit_labels`, `tags`, `languages`, `industries`,
// `event_types`) to confirm a live, talent-editable row, then joins the static
// governance metadata above. `talent_type` (no B row) + `skills` (deprecated in B)
// are NOT in the B-eligible set, so they drop — NON-REGRESSIVE (see module header).
// B's canonical `label`/`label_es` win when present; the skeleton supplies the
// fallback + the metadata B doesn't carry.

async function readTaxonomyEditableFieldsFromB(
  supabase: SupabaseClient,
): Promise<DashboardNavEditableTaxonomyFields> {
  // The taxonomy direct-match keys that survive in B.
  const taxonomyBKeys = ["fit_labels", "tags", "languages", "industries", "event_types"];

  const { data: bTaxonomyDefs, error: bErr } = await supabase
    .from("profile_field_definitions")
    .select("field_key, label, label_es, display_order, kind")
    .in("field_key", taxonomyBKeys)
    .is("deprecated_at", null)
    .eq("talent_editable", true);

  if (bErr) throw new Error(`[dashboard_nav/taxonomy-B] profile_field_definitions: ${bErr.message}`);

  const skeletonByKey = new Map(TAXONOMY_FIELD_SKELETON.map((s) => [s.key, s]));

  type BRow = {
    field_key: string;
    label: string | null;
    label_es: string | null;
    display_order: number | null;
    kind: string | null;
  };
  const result: DashboardNavEditableTaxonomyFields = [];

  for (const bRow of (bTaxonomyDefs ?? []) as BRow[]) {
    const skel = skeletonByKey.get(bRow.field_key);
    if (!skel) continue; // not a governance-visible taxonomy field

    result.push({
      key: bRow.field_key,
      label_en: bRow.label ?? skel.label_en,
      label_es: bRow.label_es ?? skel.label_es ?? null,
      taxonomy_kind: skel.taxonomy_kind,
      sort_order: skel.sort_order,
      group_sort_order: skel.group_sort_order,
    });
  }

  return result
    .filter(
      (f) =>
        f.taxonomy_kind !== "location_city" &&
        f.taxonomy_kind !== "location_country",
    )
    .sort(
      (a, b) =>
        a.group_sort_order - b.group_sort_order || a.sort_order - b.sort_order,
    );
}

/** The reader pair for `loadTalentTaxonomyEditorData`'s editableFields. T3.2 —
 *  System A removed: both legs read System B liveness + static governance metadata. */
export const taxonomyEditableFieldsReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient],
  DashboardNavEditableTaxonomyFields
> = {
  readA: readTaxonomyEditableFieldsFromB,
  readB: readTaxonomyEditableFieldsFromB,
};

/**
 * PUBLIC entry — read the taxonomy editor's editable field governance list from
 * the active source for the `dashboard_nav` surface.
 */
export function readDashboardTaxonomyEditableFields(
  supabase: SupabaseClient,
): Promise<DashboardNavEditableTaxonomyFields> {
  return readFieldSurface("dashboard_nav", taxonomyEditableFieldsReaderPair, supabase);
}
