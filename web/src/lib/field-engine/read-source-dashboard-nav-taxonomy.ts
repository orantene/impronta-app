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

// ── A-reader: loadTalentTaxonomyEditorData editableFields ──────────────────────
//
// Lifted from `loadTalentTaxonomyEditorData` (~:254–287): reads `field_definitions`
// for taxonomy-type fields + joins `field_groups` for group_sort_order.

async function readTaxonomyEditableFieldsFromA(
  supabase: SupabaseClient,
): Promise<DashboardNavEditableTaxonomyFields> {
  const { data: fieldRows, error: fErr } = await supabase
    .from("field_definitions")
    .select("key, label_en, label_es, taxonomy_kind, sort_order, field_groups(sort_order)")
    .eq("active", true)
    .is("archived_at", null)
    .eq("editable_by_talent", true)
    .eq("profile_visible", true)
    .eq("internal_only", false)
    .in("value_type", ["taxonomy_single", "taxonomy_multi"])
    .not("taxonomy_kind", "is", null);

  if (fErr) throw new Error(`[dashboard_nav/taxonomy-A] field_definitions: ${fErr.message}`);

  return ((fieldRows ?? []) as Array<{
    key: string;
    label_en: string;
    label_es: string | null;
    taxonomy_kind: string;
    sort_order: number;
    field_groups: { sort_order: number } | { sort_order: number }[] | null;
  }>)
    .map((row) => {
      const fg = row.field_groups;
      const groupSort = Array.isArray(fg) ? fg[0]?.sort_order ?? 0 : fg?.sort_order ?? 0;
      return {
        key: row.key,
        label_en: row.label_en,
        label_es: row.label_es ?? null,
        taxonomy_kind: row.taxonomy_kind,
        sort_order: row.sort_order ?? 0,
        group_sort_order: groupSort,
      };
    })
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

// ── B-reader: loadTalentTaxonomyEditorData editableFields ──────────────────────
//
// Reads B's `profile_field_definitions` for the taxonomy-type fields
// (kind = multiselect / chips / select where there's an A taxonomy_kind
// equivalent). Since B does not store `taxonomy_kind` separately, we derive it
// from the A def via the key bridge for bridged keys, or use the field_key
// itself for direct-match taxonomy keys.
//
// Only the 5 direct-match taxonomy keys (`fit_labels`, `tags`, `languages`,
// `industries`, `event_types`) are taxonomy-type fields in A's sense that are
// governance-visible. `talent_type` is a taxonomy_single but has no B row.
// The `skills` key is deprecated in B.
//
// For the taxonomy editor, the B-reader produces the SAME shape
// `DashboardNavEditableTaxonomyFields`, using A group sort_order as
// `group_sort_order` (via the A→group mapping).

async function readTaxonomyEditableFieldsFromB(
  supabase: SupabaseClient,
): Promise<DashboardNavEditableTaxonomyFields> {
  // The taxonomy direct-match keys that survive in B
  const taxonomyBKeys = ["fit_labels", "tags", "languages", "industries", "event_types"];

  const [
    { data: bTaxonomyDefs, error: bErr },
    { data: aTaxonomyDefs, error: aErr },
  ] = await Promise.all([
    supabase
      .from("profile_field_definitions")
      .select("field_key, label, label_es, display_order, kind")
      .in("field_key", taxonomyBKeys)
      .is("deprecated_at", null)
      .eq("talent_editable", true),
    // Still need A field_definitions to get sort_order + taxonomy_kind + group sort_order
    supabase
      .from("field_definitions")
      .select("key, label_en, label_es, taxonomy_kind, sort_order, field_groups(sort_order)")
      .eq("active", true)
      .is("archived_at", null)
      .eq("editable_by_talent", true)
      .eq("profile_visible", true)
      .eq("internal_only", false)
      .in("value_type", ["taxonomy_single", "taxonomy_multi"])
      .not("taxonomy_kind", "is", null),
  ]);

  if (bErr) throw new Error(`[dashboard_nav/taxonomy-B] profile_field_definitions: ${bErr.message}`);
  if (aErr) throw new Error(`[dashboard_nav/taxonomy-B] field_definitions: ${aErr.message}`);

  type ARow = {
    key: string;
    label_en: string;
    label_es: string | null;
    taxonomy_kind: string;
    sort_order: number;
    field_groups: { sort_order: number } | { sort_order: number }[] | null;
  };
  const aByKey = new Map<string, ARow>(
    ((aTaxonomyDefs ?? []) as ARow[]).map((r) => [r.key, r]),
  );

  type BRow = {
    field_key: string;
    label: string | null;
    label_es: string | null;
    display_order: number | null;
    kind: string | null;
  };
  const result: DashboardNavEditableTaxonomyFields = [];

  for (const bRow of (bTaxonomyDefs ?? []) as BRow[]) {
    const aRow = aByKey.get(bRow.field_key);
    if (!aRow) continue; // No A equivalent → skip

    const fg = aRow.field_groups;
    const groupSort = Array.isArray(fg) ? fg[0]?.sort_order ?? 0 : fg?.sort_order ?? 0;

    result.push({
      key: bRow.field_key,
      label_en: bRow.label ?? aRow.label_en,
      label_es: bRow.label_es ?? aRow.label_es ?? null,
      taxonomy_kind: aRow.taxonomy_kind,
      sort_order: aRow.sort_order ?? 0,
      group_sort_order: groupSort,
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

/** The reader pair for `loadTalentTaxonomyEditorData`'s editableFields. */
export const taxonomyEditableFieldsReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient],
  DashboardNavEditableTaxonomyFields
> = {
  readA: readTaxonomyEditableFieldsFromA,
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
