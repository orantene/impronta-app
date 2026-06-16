// src/lib/profile-editor/section-layout.ts
//
// DB-backed source of truth for the talent profile-editor SIDEBAR structure
// (the rail's group headers + their order, and each section's label + emoji).
//
// Background: today the structure lives in two hardcoded TS literals —
//   - TalentProfileShellDrawer.tsx  RAIL_GROUPS  (groups + order + which
//     section ids belong to each group; the Portfolio group header flips to
//     "Photos of work / venue" for service-primary talents)
//   - profile-state.tsx             SECTION_META (per-section label + emoji)
//
// B0 moves that structure into two soft-archive tables
// (`profile_editor_section_groups`, `profile_editor_sections`, seeded by
// migration 20260609223834_profile_editor_section_layout.sql) and exposes it
// through `loadProfileEditorLayout()`. The loader is cached and falls back to
// `deriveLayoutFromHardcoded()` on ANY error / empty result / missing service
// client, so it can never crash a render or change behavior before consumers
// (the B1 agent) wire it into the drawer.
//
// IMPORTANT: this module is plain server code (NOT "use server"). It must
// never import client components — the hardcoded structure is DUPLICATED here
// verbatim so it stays import-free and doubles as the seed-parity reference.

import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CACHE_TAG_PROFILE_EDITOR_LAYOUT } from "@/lib/field-engine/cache-tags";

import type {
  ProfileEditorGroup,
  ProfileEditorLayout,
  ProfileEditorSection,
} from "./layout-types";

export type { ProfileEditorGroup, ProfileEditorLayout, ProfileEditorSection };

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded fallback — must stay byte-for-byte identical to RAIL_GROUPS
// (TalentProfileShellDrawer.tsx) + SECTION_META (profile-state.tsx). This is
// both the fallback layout AND the seed-parity source for the migration.
// ─────────────────────────────────────────────────────────────────────────────

/** Per-section label + emoji, copied verbatim from SECTION_META. */
const HARDCODED_SECTION_META: Record<string, { label: string; emoji: string }> = {
  identity:      { label: "Identity",      emoji: "👤" },
  services:      { label: "Services",      emoji: "🎯" },
  location:      { label: "Location",      emoji: "📍" },
  logistics:     { label: "Logistics",     emoji: "🧳" },
  media:         { label: "Media",         emoji: "📷" },
  albums:        { label: "Albums",        emoji: "🗂" },
  polaroids:     { label: "Polaroids",     emoji: "🪪" },
  about:         { label: "About",         emoji: "✏️" },
  physical:      { label: "Physical",      emoji: "📐" },
  wardrobe:      { label: "Wardrobe",      emoji: "👗" },
  details:       { label: "Details",       emoji: "📋" },
  rates:         { label: "Rates",         emoji: "💶" },
  availability:  { label: "Availability",  emoji: "📅" },
  credits:       { label: "Credits",       emoji: "🏆" },
  limits:        { label: "Restrictions",  emoji: "⊘" },
  files:         { label: "Files",         emoji: "📎" },
  social_proof:  { label: "Past clients",  emoji: "⭐" },
  verifications: { label: "Trust",         emoji: "🛡" },
  agency_fields: { label: "Agency Fields", emoji: "🧬" },
  admin:         { label: "Admin",         emoji: "🔒" },
};

/** Groups + member section ids, in rail order — copied verbatim from
 *  RAIL_GROUPS. `labelEnAlt` carries the conditional Portfolio header. */
const HARDCODED_GROUPS: {
  slug: string;
  labelEn: string;
  labelEnAlt: string | null;
  sectionSlugs: string[];
}[] = [
  { slug: "profile",     labelEn: "Profile",     labelEnAlt: null,                     sectionSlugs: ["identity", "location", "about", "services"] },
  { slug: "craft",       labelEn: "Craft",       labelEnAlt: null,                     sectionSlugs: ["physical", "wardrobe", "details"] },
  { slug: "logistics",   labelEn: "Logistics",   labelEnAlt: null,                     sectionSlugs: ["logistics", "availability"] },
  { slug: "portfolio",   labelEn: "Portfolio",   labelEnAlt: "Photos of work / venue", sectionSlugs: ["media", "albums", "polaroids"] },
  { slug: "terms",       labelEn: "Terms",       labelEnAlt: null,                     sectionSlugs: ["rates", "limits"] },
  { slug: "proof",       labelEn: "Proof",       labelEnAlt: null,                     sectionSlugs: ["credits", "social_proof", "verifications"] },
  { slug: "back_office", labelEn: "Back office", labelEnAlt: null,                     sectionSlugs: ["files", "agency_fields", "admin"] },
];

export function deriveLayoutFromHardcoded(): ProfileEditorLayout {
  const groups: ProfileEditorGroup[] = HARDCODED_GROUPS.map((g) => ({
    slug: g.slug,
    labelEn: g.labelEn,
    labelEs: null,
    labelEnAlt: g.labelEnAlt,
    labelEsAlt: null,
    sections: g.sectionSlugs.map((slug) => {
      const meta = HARDCODED_SECTION_META[slug];
      return {
        slug,
        labelEn: meta?.label ?? slug,
        labelEs: null,
        emoji: meta?.emoji ?? "",
      };
    }),
  }));
  return buildLayout(groups);
}

/** Assemble orderedSectionSlugs + sectionMeta from an ordered group list. */
function buildLayout(groups: ProfileEditorGroup[]): ProfileEditorLayout {
  const orderedSectionSlugs: string[] = [];
  const sectionMeta: Record<string, { label: string; labelEs: string | null; emoji: string }> = {};
  for (const group of groups) {
    for (const section of group.sections) {
      orderedSectionSlugs.push(section.slug);
      sectionMeta[section.slug] = {
        label: section.labelEn,
        labelEs: section.labelEs,
        emoji: section.emoji,
      };
    }
  }
  return { groups, orderedSectionSlugs, sectionMeta };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed loader (cached). Never throws — every failure path returns the
// hardcoded fallback so the editor renders identically pre-wiring.
// ─────────────────────────────────────────────────────────────────────────────

type GroupRow = {
  id: string;
  slug: string;
  label_en: string;
  label_es: string | null;
  label_en_alt: string | null;
  label_es_alt: string | null;
  sort_order: number;
};

type SectionRow = {
  slug: string;
  // profile_editor_sections.label_en/label_es folded into label_i18n (WS3).
  // (section_GROUPS still carry label_en/label_es — those are NOT migrated.)
  label_i18n: Record<string, string | null> | null;
  emoji: string;
  section_group_id: string | null;
  sort_order: number;
};

async function loadProfileEditorLayoutUncached(): Promise<ProfileEditorLayout> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return deriveLayoutFromHardcoded();

    const [groupsRes, sectionsRes] = await Promise.all([
      supabase
        .from("profile_editor_section_groups")
        .select("id, slug, label_en, label_es, label_en_alt, label_es_alt, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("profile_editor_sections")
        .select("slug, label_i18n, emoji, section_group_id, sort_order")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
    ]);

    if (groupsRes.error) {
      // Missing tables (pre-migration) are expected — fall back quietly. Avoid
      // console.error here: Next dev treats server console.error as a blocking
      // overlay even when we recover and return hardcoded layout.
      if (process.env.NODE_ENV === "production") {
        // eslint-disable-next-line no-console
        console.warn(
          "[profile-editor-layout] groups query failed:",
          groupsRes.error.message,
        );
      }
      return deriveLayoutFromHardcoded();
    }
    if (sectionsRes.error) {
      if (process.env.NODE_ENV === "production") {
        // eslint-disable-next-line no-console
        console.warn(
          "[profile-editor-layout] sections query failed:",
          sectionsRes.error.message,
        );
      }
      return deriveLayoutFromHardcoded();
    }

    const groupRows = (groupsRes.data ?? []) as GroupRow[];
    const sectionRows = (sectionsRes.data ?? []) as SectionRow[];
    if (groupRows.length === 0) return deriveLayoutFromHardcoded();

    // Bucket sections under their group, preserving the sort_order from the
    // already-ordered query.
    const sectionsByGroup = new Map<string, ProfileEditorSection[]>();
    for (const row of sectionRows) {
      if (!row.section_group_id) continue;
      const bucket = sectionsByGroup.get(row.section_group_id) ?? [];
      bucket.push({
        slug: row.slug,
        labelEn: row.label_i18n?.en ?? "",
        labelEs: row.label_i18n?.es ?? null,
        emoji: row.emoji ?? "",
      });
      sectionsByGroup.set(row.section_group_id, bucket);
    }

    const groups: ProfileEditorGroup[] = groupRows.map((g) => ({
      slug: g.slug,
      labelEn: g.label_en,
      labelEs: g.label_es,
      labelEnAlt: g.label_en_alt,
      labelEsAlt: g.label_es_alt,
      sections: sectionsByGroup.get(g.id) ?? [],
    }));

    return buildLayout(groups);
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.warn("[profile-editor-layout] unexpected loader error:", err);
    }
    return deriveLayoutFromHardcoded();
  }
}

const cachedLoadProfileEditorLayout = unstable_cache(
  loadProfileEditorLayoutUncached,
  ["profile-editor-layout", "v1"],
  { tags: [CACHE_TAG_PROFILE_EDITOR_LAYOUT], revalidate: 300 },
);

export async function loadProfileEditorLayout(): Promise<ProfileEditorLayout> {
  try {
    return await cachedLoadProfileEditorLayout();
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.warn("[profile-editor-layout] cache wrapper error:", err);
    }
    return deriveLayoutFromHardcoded();
  }
}
