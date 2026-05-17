// ============================================================================
// admin-talent-contexts.types.ts — Shared types for the Contexts / Best-Fit
// system. Separate from admin-talent-contexts.ts because Next.js disallows
// non-async exports from "use server" files.
//
// Contexts = talent_profile_taxonomy rows with relationship_type='context',
// FK taxonomy_term_id -> taxonomy_terms where term_type='context', grouped
// under taxonomy_terms where term_type='context_group'. No DB cap trigger
// applies to context rows (enforce_talent_skill_caps skips non-role rows).
// ============================================================================

export type ResolvedContext = {
  context_term_id: string;
  context_slug: string;
  context_name_en: string;
  context_name_es: string | null;
  group_id: string | null;
  group_slug: string | null;
  group_name_en: string | null;
  group_sort_order: number;
  sort_order: number;
};

export type ContextCatalogGroup = {
  group_id: string;
  group_slug: string;
  group_name_en: string;
  sort_order: number;
  contexts: Array<{
    id: string;
    slug: string;
    name_en: string;
    name_es: string | null;
    sort_order: number;
  }>;
};

// Input-hygiene ceiling only — NOT a product cap. Contexts have no DB cap;
// this just rejects pathological payloads (there are ~80 active terms).
export const MAX_CONTEXTS_PER_TALENT = 100;
