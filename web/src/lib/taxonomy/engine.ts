/**
 * Taxonomy engine — single source of truth for category logic across the app.
 *
 * The parent_category is the unit of identity. Children (talent_type,
 * specialty) exist to resolve back to a parent. UI surfaces should use this
 * engine for any taxonomy decision so the rules live in one place:
 *
 *   - "What parent does this term belong to?"          → getParentCategoryFromMap / fetchParentCategoryByTermId
 *   - "What parent does this profile belong to?"        → extractPrimaryRoleTerm + getParentCategoryFromMap
 *   - "What's in Models?"                                → fetchDescendantsOf
 *   - "What's the user-friendly name for this parent?"  → shortParentLabel
 *   - "Is this a talent_type / parent_category term?"   → isTalentTypeTerm / isParentCategoryTerm
 *   - "List the marketplace top-level groups"           → fetchParentCategories({ visibleOnly: true })
 *
 * Handles BOTH the legacy shape (kind='talent_type', is_primary) and the v2
 * shape (term_type, relationship_type) so callers don't have to branch.
 *
 * If product changes a categorization rule (e.g. "Fire Dancer should resolve
 * to Specialty Performers, not Dancers"), the change lives in this file.
 * Every consumer updates automatically.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { shortParentLabel } from "./parent-labels";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

/**
 * A taxonomy_terms row in the shape used by this engine. Optional fields
 * tolerate partial selects from legacy callsites that don't fetch every
 * column.
 */
export type TermShape = {
  id: string;
  slug: string;
  name_en: string;
  name_es?: string | null;
  /** Legacy enum (talent_type, skill, language, …). */
  kind?: string | null;
  /** v2 hierarchical type (parent_category, talent_type, …). */
  term_type?: string | null;
  parent_id?: string | null;
  level?: number | null;
  is_public_filter?: boolean | null;
  is_active?: boolean | null;
  archived_at?: string | null;
};

export type ParentCategoryView = {
  id: string;
  slug: string;
  /** Canonical full name from taxonomy_terms.name_en (e.g. "Hosts & Promo"). */
  fullLabel: string;
  /** User-friendly short label for UI (e.g. "Hosts"). */
  shortLabel: string;
  isPublicFilter: boolean;
};

/**
 * Shape of a talent_profile_taxonomy join row when the caller selects
 * `taxonomy_terms (...)` inline. Postgrest returns either a single object
 * or an array depending on relationship cardinality, so we accept both.
 */
export type ProfileTaxonomyRow = {
  is_primary?: boolean | null;
  relationship_type?: string | null;
  taxonomy_terms?: TermShape | TermShape[] | null;
};

// ────────────────────────────────────────────────────────────────────────
// Term-type predicates
// ────────────────────────────────────────────────────────────────────────

/**
 * True if the term represents a "talent type" (a bookable role).
 * Handles both legacy (kind='talent_type') and v2 (term_type='talent_type').
 *
 * Use this anywhere you'd otherwise write `kind === 'talent_type'`.
 */
export function isTalentTypeTerm(term: { kind?: string | null; term_type?: string | null }): boolean {
  return term.term_type === "talent_type" || (!term.term_type && term.kind === "talent_type");
}

/**
 * True if the term is a parent_category (top-level marketplace group).
 * Pure v2 — no legacy fallback because parent_category didn't exist before.
 */
export function isParentCategoryTerm(term: { term_type?: string | null }): boolean {
  return term.term_type === "parent_category";
}

// ────────────────────────────────────────────────────────────────────────
// Profile primary/secondary role extraction
// ────────────────────────────────────────────────────────────────────────

function unwrapTerm(row: ProfileTaxonomyRow): TermShape | null {
  const t = row.taxonomy_terms;
  if (!t) return null;
  if (Array.isArray(t)) return t[0] ?? null;
  return t;
}

/**
 * Given a profile's joined talent_profile_taxonomy + taxonomy_terms rows,
 * return the primary role term (the "what gets shown on the card" term).
 *
 * Resolution order:
 *   1. Any row with `relationship_type='primary_role'`         (v2)
 *   2. Any row with `is_primary=true` AND term is talent_type   (legacy)
 *
 * Returns null if no primary role is set.
 */
export function extractPrimaryRoleTerm(rows: ProfileTaxonomyRow[]): TermShape | null {
  for (const row of rows) {
    if (row.relationship_type === "primary_role") {
      const term = unwrapTerm(row);
      if (term) return term;
    }
  }
  for (const row of rows) {
    if (row.is_primary === true) {
      const term = unwrapTerm(row);
      if (term && isTalentTypeTerm(term)) return term;
    }
  }
  return null;
}

/**
 * Returns all secondary role terms for a profile.
 *
 * Resolution order:
 *   1. Rows with `relationship_type='secondary_role'`           (v2)
 *   2. Non-primary talent_type rows                              (legacy fallback)
 */
export function extractSecondaryRoleTerms(rows: ProfileTaxonomyRow[]): TermShape[] {
  const v2: TermShape[] = [];
  for (const row of rows) {
    if (row.relationship_type === "secondary_role") {
      const term = unwrapTerm(row);
      if (term) v2.push(term);
    }
  }
  if (v2.length > 0) return v2;
  // Legacy fallback: any non-primary talent_type
  const legacy: TermShape[] = [];
  for (const row of rows) {
    if (row.is_primary !== true) {
      const term = unwrapTerm(row);
      if (term && isTalentTypeTerm(term)) legacy.push(term);
    }
  }
  return legacy;
}

/**
 * Same as extractPrimaryRoleTerm but returns the entire row (so callers
 * can read FK columns like taxonomy_term_id). Useful for code that needs
 * the assignment id, not just the term name.
 */
export function extractPrimaryRoleRow<R extends ProfileTaxonomyRow>(rows: R[]): R | null {
  for (const row of rows) {
    if (row.relationship_type === "primary_role") {
      const term = unwrapTerm(row);
      if (term) return row;
    }
  }
  for (const row of rows) {
    if (row.is_primary === true) {
      const term = unwrapTerm(row);
      if (term && isTalentTypeTerm(term)) return row;
    }
  }
  return null;
}

/**
 * Returns terms attached as a specific relationship_type ('skill', 'context',
 * 'specialty', 'credential', 'attribute'). v2-only — legacy rows that lack
 * relationship_type are ignored because the inference would be guesswork.
 */
export function extractTermsByRelationship(
  rows: ProfileTaxonomyRow[],
  relationship: "skill" | "context" | "specialty" | "credential" | "attribute",
): TermShape[] {
  const out: TermShape[] = [];
  for (const row of rows) {
    if (row.relationship_type === relationship) {
      const term = unwrapTerm(row);
      if (term) out.push(term);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Parent resolution (sync — caller has all terms in memory)
// ────────────────────────────────────────────────────────────────────────

/**
 * Walks the parent_id chain to find the parent_category that owns this term.
 * Caller provides a Map<termId, term> built from a single fetch — typically
 * built from the same query that returned the term.
 *
 * Returns the term whose term_type='parent_category', or null if no parent
 * is found within 10 levels.
 */
export function getParentCategoryFromMap(
  termId: string,
  allTerms: Map<string, TermShape>,
): TermShape | null {
  let cur: TermShape | null = allTerms.get(termId) ?? null;
  let depth = 0;
  while (cur && depth < 10) {
    if (isParentCategoryTerm(cur)) return cur;
    if (!cur.parent_id) return null;
    const next = allTerms.get(cur.parent_id);
    if (!next || next.id === cur.id) return null;
    cur = next;
    depth++;
  }
  return null;
}

/**
 * Returns the parent_category lineage for a term, ordered root-to-leaf.
 * Example: getLineageFromMap(fireDancerId, ...) →
 *   [Performers, Specialty Performers, Fire Dancer]
 * Useful for AI search documents and breadcrumb display.
 */
export function getLineageFromMap(termId: string, allTerms: Map<string, TermShape>): TermShape[] {
  const path: TermShape[] = [];
  let cur: TermShape | null = allTerms.get(termId) ?? null;
  let depth = 0;
  while (cur && depth < 10) {
    path.unshift(cur);
    if (!cur.parent_id) break;
    const next = allTerms.get(cur.parent_id);
    if (!next || next.id === cur.id) break;
    cur = next;
    depth++;
  }
  return path;
}

// ────────────────────────────────────────────────────────────────────────
// Server-side helpers (require Supabase)
// ────────────────────────────────────────────────────────────────────────

/**
 * Async parent walk — for callers without an in-memory term map.
 */
export async function fetchParentCategoryByTermId(
  supabase: SupabaseClient,
  termId: string,
): Promise<TermShape | null> {
  let nextId: string | null = termId;
  let depth = 0;
  while (nextId && depth < 10) {
    const { data, error } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en, name_es, kind, term_type, parent_id, level, is_public_filter, archived_at")
      .eq("id", nextId)
      .maybeSingle();
    if (error || !data) return null;
    const cur = data as TermShape;
    if (isParentCategoryTerm(cur)) return cur;
    nextId = cur.parent_id ?? null;
    depth++;
  }
  return null;
}

/**
 * Fetch the lineage from term up to its parent_category, root-to-leaf.
 */
export async function fetchLineageByTermId(
  supabase: SupabaseClient,
  termId: string,
): Promise<TermShape[]> {
  const path: TermShape[] = [];
  let nextId: string | null = termId;
  let depth = 0;
  while (nextId && depth < 10) {
    const { data, error } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en, name_es, kind, term_type, parent_id, level, is_public_filter, archived_at")
      .eq("id", nextId)
      .maybeSingle();
    if (error || !data) break;
    const cur = data as TermShape;
    path.unshift(cur);
    nextId = cur.parent_id ?? null;
    depth++;
  }
  return path;
}

/**
 * List parent_categories. visibleOnly=true returns the marketplace top-bar
 * set (≈8 with is_public_filter=TRUE); false returns all 19.
 *
 * Returns ParentCategoryView (with shortLabel pre-resolved) so consumers
 * don't have to call shortParentLabel themselves.
 */
export async function fetchParentCategories(
  supabase: SupabaseClient,
  opts?: { visibleOnly?: boolean },
): Promise<ParentCategoryView[]> {
  let query = supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en, is_public_filter, sort_order")
    .eq("term_type", "parent_category")
    .is("archived_at", null)
    .order("sort_order");
  if (opts?.visibleOnly) {
    query = query.eq("is_public_filter", true);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as { id: string; slug: string; name_en: string; is_public_filter: boolean | null }[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    fullLabel: row.name_en,
    shortLabel: shortParentLabel({ slug: row.slug, name: row.name_en }),
    isPublicFilter: !!row.is_public_filter,
  }));
}

/**
 * Recursive descendants of a parent term. Wraps `public.descendants_of()`
 * (PR 1 SQL function). Returns the term ids (including the input id).
 *
 * Use for "filter by parent_category" queries:
 *   const ids = await fetchDescendantsOf(supabase, modelsParentId);
 *   // then: WHERE talent_profile_taxonomy.taxonomy_term_id IN (ids)
 */
export async function fetchDescendantsOf(
  supabase: SupabaseClient,
  parentId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("descendants_of", { p_term_id: parentId });
  if (error || !data) return [];
  return (data as { id: string }[]).map((r) => r.id);
}

// ────────────────────────────────────────────────────────────────────────
// Re-exports
// ────────────────────────────────────────────────────────────────────────

export { shortParentLabel, SHORT_PARENT_LABEL } from "./parent-labels";
