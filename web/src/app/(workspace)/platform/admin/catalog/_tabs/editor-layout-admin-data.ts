// Admin-side loader for the Editor Layout tab (B2).
//
// loadProfileEditorLayout() (src/lib/profile-editor/section-layout.ts) returns
// only the *active* rendered structure — slugs + labels — for the live editor.
// The admin surface needs the full editable rows: UUIDs, alt labels, sort_order,
// is_active / is_system / archived_at, and the section→group FK, including
// inactive/archived rows so the operator can restore them.
//
// This loader queries BOTH soft-archive tables fully via the service-role client
// (route is super_admin-gated by the platform layout) and joins the field
// catalog (loadPlatformCatalogMap) so each section can list the catalog fields
// whose `section === section.slug`. Degrades to an empty shape on any failure so
// the tab never hard-fails.

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  loadPlatformCatalogMap,
  type CatalogField,
} from "../../../catalog-map-data";

export type EditorSectionField = {
  field_key: string;
  label: string;
  label_es: string | null;
  required_default: boolean;
  deprecated: boolean;
};

export type EditorSectionRow = {
  id: string;
  slug: string;
  label_en: string;
  label_es: string | null;
  emoji: string;
  section_group_id: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  archived_at: string | null;
  /** Catalog fields whose `section === slug` (best-effort; may be empty). */
  fields: EditorSectionField[];
};

export type EditorGroupRow = {
  id: string;
  slug: string;
  label_en: string;
  label_es: string | null;
  label_en_alt: string | null;
  label_es_alt: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  sections: EditorSectionRow[];
};

export type EditorLayoutAdmin = {
  ok: boolean;
  groups: EditorGroupRow[];
  /** Sections with a null / unknown group FK — surfaced so they're not lost. */
  orphanSections: EditorSectionRow[];
  /** Flat list of every group, for the "move section into…" selects. */
  groupOptions: { id: string; label_en: string; is_active: boolean }[];
  counts: {
    groups: number;
    activeGroups: number;
    sections: number;
    activeSections: number;
    archivedSections: number;
  };
};

const EMPTY: EditorLayoutAdmin = {
  ok: false,
  groups: [],
  orphanSections: [],
  groupOptions: [],
  counts: {
    groups: 0,
    activeGroups: 0,
    sections: 0,
    activeSections: 0,
    archivedSections: 0,
  },
};

type GroupDbRow = {
  id: string;
  slug: string | null;
  label_en: string | null;
  label_es: string | null;
  label_en_alt: string | null;
  label_es_alt: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  is_system: boolean | null;
};

type SectionDbRow = {
  id: string;
  slug: string | null;
  label_en: string | null;
  label_es: string | null;
  emoji: string | null;
  section_group_id: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  is_system: boolean | null;
  archived_at: string | null;
};

function buildFieldsBySection(
  fields: CatalogField[],
): Map<string, EditorSectionField[]> {
  const bySection = new Map<string, EditorSectionField[]>();
  for (const f of fields) {
    if (!f.section) continue;
    const bucket = bySection.get(f.section) ?? [];
    bucket.push({
      field_key: f.field_key,
      label: f.label,
      label_es: null,
      required_default: f.required_default,
      deprecated: f.deprecated,
    });
    bySection.set(f.section, bucket);
  }
  for (const bucket of bySection.values()) {
    bucket.sort(
      (a, b) =>
        a.label.localeCompare(b.label) ||
        a.field_key.localeCompare(b.field_key),
    );
  }
  return bySection;
}

export async function loadEditorLayoutAdmin(): Promise<EditorLayoutAdmin> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY;

  try {
    const [groupsRes, sectionsRes, catalog] = await Promise.all([
      sb
        .from("profile_editor_section_groups")
        .select(
          "id, slug, label_en, label_es, label_en_alt, label_es_alt, sort_order, is_active, is_system",
        )
        .order("sort_order", { ascending: true }),
      sb
        .from("profile_editor_sections")
        .select(
          "id, slug, label_en, label_es, emoji, section_group_id, sort_order, is_active, is_system, archived_at",
        )
        .order("sort_order", { ascending: true }),
      loadPlatformCatalogMap(),
    ]);

    if (groupsRes.error || sectionsRes.error) {
      // eslint-disable-next-line no-console
      console.error(
        "[editor-layout-admin] load failed:",
        groupsRes.error?.message ?? sectionsRes.error?.message,
      );
      return EMPTY;
    }

    const catalogFields: CatalogField[] = catalog.ok
      ? [...catalog.groups.flatMap((g) => g.fields), ...catalog.ungrouped]
      : [];
    const fieldsBySection = buildFieldsBySection(catalogFields);

    const groupRows = (groupsRes.data ?? []) as GroupDbRow[];
    const sectionRows = (sectionsRes.data ?? []) as SectionDbRow[];

    const toSection = (row: SectionDbRow): EditorSectionRow => {
      const slug = row.slug ?? row.id;
      return {
        id: row.id,
        slug,
        label_en: row.label_en ?? slug,
        label_es: row.label_es,
        emoji: row.emoji ?? "",
        section_group_id: row.section_group_id,
        sort_order: row.sort_order ?? 0,
        is_active: row.is_active !== false,
        is_system: row.is_system === true,
        archived_at: row.archived_at,
        fields: fieldsBySection.get(slug) ?? [],
      };
    };

    const sectionsByGroup = new Map<string, EditorSectionRow[]>();
    const orphanSections: EditorSectionRow[] = [];
    for (const row of sectionRows) {
      const section = toSection(row);
      if (section.section_group_id) {
        const bucket = sectionsByGroup.get(section.section_group_id) ?? [];
        bucket.push(section);
        sectionsByGroup.set(section.section_group_id, bucket);
      } else {
        orphanSections.push(section);
      }
    }

    const groups: EditorGroupRow[] = groupRows.map((g) => {
      const slug = g.slug ?? g.id;
      return {
        id: g.id,
        slug,
        label_en: g.label_en ?? slug,
        label_es: g.label_es,
        label_en_alt: g.label_en_alt,
        label_es_alt: g.label_es_alt,
        sort_order: g.sort_order ?? 0,
        is_active: g.is_active !== false,
        is_system: g.is_system === true,
        sections: sectionsByGroup.get(g.id) ?? [],
      };
    });

    const activeGroups = groups.filter((g) => g.is_active).length;
    const activeSections = sectionRows.filter(
      (s) => s.is_active !== false && !s.archived_at,
    ).length;
    const archivedSections = sectionRows.filter((s) => !!s.archived_at).length;

    return {
      ok: true,
      groups,
      orphanSections,
      groupOptions: groups.map((g) => ({
        id: g.id,
        label_en: g.label_en,
        is_active: g.is_active,
      })),
      counts: {
        groups: groups.length,
        activeGroups,
        sections: sectionRows.length,
        activeSections,
        archivedSections,
      },
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[editor-layout-admin] unexpected error:", e);
    return EMPTY;
  }
}
