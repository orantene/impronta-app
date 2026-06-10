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
  id: string;
  field_key: string;
  label: string;
  label_es: string | null;
  tier: string;
  required_default: boolean;
  deprecated: boolean;
  /** 'catalog' = generic catalog renderer; 'bespoke' = hand-coded editor
   *  control. Surfaced so the admin can see which fields are coded. */
  render_mode: string;
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

export type UnmappedSectionBucket = {
  /** The raw `profile_field_definitions.section` value (e.g. "skills", "languages"). */
  section: string;
  fields: EditorSectionField[];
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
  /**
   * DB field-section values (profile_field_definitions.section) that are NOT
   * claimed by any entry in SECTION_FIELD_SECTIONS.  Surfaced so nothing is
   * hidden from the admin.
   */
  unmappedSections: UnmappedSectionBucket[];
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
  unmappedSections: [],
};

/**
 * Explicit mapping from profile-editor section slug → the DB
 * `profile_field_definitions.section` values whose fields belong there.
 * An empty array means the section has no directly-mapped catalog fields
 * (it may be composed or rendered without field-gating).
 */
// Maps each RAIL section slug (the 20 sections the talent editor actually
// renders — RAIL_GROUPS / profile_editor_sections) to the DB
// `profile_field_definitions.section` values whose fields render there.
//
// Migration 20260610090001 re-tags most fields onto their editor slug
// (bios/languages→about, social→social_proof, travel→logistics,
// documents→files, skills→refinement, emergency→admin, media.polaroids→
// polaroids). Three editor concepts are NOT standalone rail sections
// (commercial_terms "Booking terms", refinement "Extra details", reviews) —
// their fields are folded into the nearest rail accordion (Rates, Details,
// Credits) so nothing is hidden. Legacy section aliases (travel/skills/social/
// emergency/documents) are kept as defense-in-depth against drift. Every
// distinct DB section value is claimed → `unmappedSections` stays empty and
// the admin "Section Fields" tab mirrors the editor 1:1.
const SECTION_FIELD_SECTIONS: Record<string, string[]> = {
  identity: ["identity"],
  services: ["services"],
  location: ["location"],
  logistics: ["logistics", "travel"],
  media: ["media"],
  albums: ["albums"],
  polaroids: ["polaroids"],
  about: ["about"],
  physical: ["measurements"],
  wardrobe: ["wardrobe"],
  details: ["type-specific", "refinement", "skills"],
  rates: ["rates", "commercial_terms"],
  availability: ["availability"],
  credits: ["credits", "reviews"],
  limits: ["limits"],
  files: ["files", "documents"],
  social_proof: ["social_proof", "social"],
  verifications: ["verifications"],
  agency_fields: ["agency_fields"],
  admin: ["admin", "emergency"],
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

/** Converts a CatalogField to the slim EditorSectionField shape. */
function toSectionField(f: CatalogField): EditorSectionField {
  return {
    id: f.id,
    field_key: f.field_key,
    label: f.label,
    label_es: null, // not available in CatalogField; kept for future join
    tier: f.tier,
    required_default: f.required_default,
    deprecated: f.deprecated,
    render_mode: f.render_mode ?? "catalog",
  };
}

type FieldBuckets = {
  /**
   * Map from editor-section slug → fields that belong there (using
   * SECTION_FIELD_SECTIONS). Keys are always present (even if empty array).
   */
  bySectionSlug: Map<string, EditorSectionField[]>;
  /** DB field-section values not claimed by any slug entry. */
  unmappedSections: UnmappedSectionBucket[];
};

function buildFieldBuckets(fields: CatalogField[]): FieldBuckets {
  // Build the reverse lookup: DB section value → editor slug(s)
  // (one DB section value can map to at most one slug in our map)
  const dbSectionToSlug = new Map<string, string>();
  for (const [slug, dbSections] of Object.entries(SECTION_FIELD_SECTIONS)) {
    for (const dbSec of dbSections) {
      dbSectionToSlug.set(dbSec, slug);
    }
  }

  // Collect all claimed DB section values
  const claimedDbSections = new Set<string>(dbSectionToSlug.keys());

  // Initialise slug buckets (so every editor slug key is present)
  const bySectionSlug = new Map<string, EditorSectionField[]>();
  for (const slug of Object.keys(SECTION_FIELD_SECTIONS)) {
    bySectionSlug.set(slug, []);
  }

  // Group fields into either a slug bucket or the unmapped pile
  const unmappedByDbSection = new Map<string, EditorSectionField[]>();

  for (const f of fields) {
    const dbSec = f.section ?? null;
    const sectionField = toSectionField(f);

    if (dbSec && claimedDbSections.has(dbSec)) {
      const slug = dbSectionToSlug.get(dbSec)!;
      bySectionSlug.get(slug)!.push(sectionField);
    } else {
      // null section or an unclaimed DB section value
      const key = dbSec ?? "(no section)";
      const bucket = unmappedByDbSection.get(key) ?? [];
      bucket.push(sectionField);
      unmappedByDbSection.set(key, bucket);
    }
  }

  // Sort each slug bucket
  for (const bucket of bySectionSlug.values()) {
    bucket.sort(
      (a, b) =>
        a.label.localeCompare(b.label) ||
        a.field_key.localeCompare(b.field_key),
    );
  }

  // Build sorted unmapped buckets
  const unmappedSections: UnmappedSectionBucket[] = Array.from(
    unmappedByDbSection.entries(),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([section, sectionFields]) => ({
      section,
      fields: sectionFields.sort(
        (a, b) =>
          a.label.localeCompare(b.label) ||
          a.field_key.localeCompare(b.field_key),
      ),
    }));

  return { bySectionSlug, unmappedSections };
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
    const { bySectionSlug, unmappedSections } = buildFieldBuckets(catalogFields);

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
        // Look up by slug in the explicit map; fall back to empty array for
        // slugs not in SECTION_FIELD_SECTIONS (e.g. newly-created sections).
        fields: bySectionSlug.get(slug) ?? [],
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
      unmappedSections,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[editor-layout-admin] unexpected error:", e);
    return EMPTY;
  }
}
