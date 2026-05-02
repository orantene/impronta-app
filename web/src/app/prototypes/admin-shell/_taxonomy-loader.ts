"use client";

/**
 * PR-A — read taxonomy from the live Supabase tables instead of the
 * hardcoded TAXONOMY fixture. Drives the parent_category picker in
 * the new-talent drawer and the talent-profile-shell.
 *
 * Read-only. No writes. Falls back to the hardcoded TAXONOMY when
 * Supabase env isn't configured (dev without env vars / SSR snapshot)
 * so the prototype still renders for design QA.
 *
 * Schema reference:
 *   public.taxonomy_terms (parent_id, term_type, level,
 *     is_public_filter, sort_order, slug, name_en, plural_name, icon)
 *   public.descendants_of(p_term_id UUID) → TABLE(id UUID)
 *
 * Display rule: parent_category → category_group → talent_type.
 * We compress the category_group middle layer in the rendered list
 * (just show all talent_type descendants flat under the parent), but
 * the FK chain is preserved on every term so deeper edits still work.
 */

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { TAXONOMY, type TaxonomyParent, type TaxonomyParentId } from "./_state";

/**
 * Live shape — every term keeps its real Supabase id + full row, so
 * the UI can pass term_id back to writes once PR-B lands. This file
 * is read-only by spec.
 */
export type LiveTaxonomyTerm = {
  id: string;          // taxonomy_terms.id (UUID, not the prototype string id)
  slug: string;
  label: string;       // name_en / fallback
  pluralLabel?: string;
  icon?: string;
  termType: string;    // parent_category | category_group | talent_type | specialty | …
  parentId: string | null;
  level: number;
  sortOrder: number;
  isPublicFilter: boolean;
  isActive: boolean;
};

export type LiveTaxonomyParent = {
  /** Display payload — slot-compatible with the existing TaxonomyParent shape. */
  display: TaxonomyParent;
  /** Raw row from taxonomy_terms (ids/slugs preserved for writes). */
  raw: LiveTaxonomyTerm;
  /** Direct talent_type descendants flattened (compressed category_group layer). */
  talentTypes: LiveTaxonomyTerm[];
};

export type LiveTaxonomyResult =
  | { source: "live"; visibleParents: LiveTaxonomyParent[]; restParents: LiveTaxonomyParent[]; loading: false; error: null }
  | { source: "fallback"; visibleParents: LiveTaxonomyParent[]; restParents: LiveTaxonomyParent[]; loading: false; error: string | null }
  | { source: null; visibleParents: []; restParents: []; loading: true; error: null };

// ── Static parent-id → emoji + helper map (display polish only) ──────
// The live taxonomy_terms.icon column is sparse in PR 1; this cosmetic
// map fills emoji + helper text where missing so the prototype keeps
// its premium look while reading real data underneath.
const PARENT_DISPLAY_HINT: Record<string, { emoji: string; helper: string }> = {
  models:           { emoji: "👤", helper: "Fashion, commercial, editorial, fit, content." },
  "hosts-promo":    { emoji: "🎤", helper: "Brand ambassadors, MCs, VIP hosts, event hosts." },
  performers:       { emoji: "✨", helper: "Dancers, acrobats, fire performers, character acts." },
  "music-djs":      { emoji: "🎧", helper: "DJs, singers, bands, musicians." },
  creators:         { emoji: "📱", helper: "Content creators, influencers, UGC." },
  influencers:      { emoji: "📱", helper: "Content creators, influencers, UGC." },
  chefs:            { emoji: "👨‍🍳", helper: "Private chefs, mixologists, sommeliers." },
  "chefs-culinary": { emoji: "👨‍🍳", helper: "Private chefs, mixologists, sommeliers." },
  wellness:         { emoji: "🌿", helper: "Massage, yoga, training, breathwork." },
  "wellness-beauty":{ emoji: "🌿", helper: "Massage, yoga, training, breathwork." },
  hospitality:      { emoji: "🏨", helper: "Housekeeping, butlers, villa staff." },
  transportation:   { emoji: "🚙", helper: "Drivers, chauffeurs, transfer services." },
  "photo-video":    { emoji: "📷", helper: "Photographers, videographers, drone." },
  "photo-creative": { emoji: "📷", helper: "Photographers, videographers, drone." },
  "event-staff":    { emoji: "✦", helper: "Setup, runners, coordinators, assistants." },
  security:         { emoji: "🛡", helper: "Bodyguards, event security, door staff." },
};

function rowToTerm(row: any): LiveTaxonomyTerm {
  return {
    id: row.id,
    slug: row.slug,
    label: row.name_en ?? row.slug,
    pluralLabel: row.plural_name ?? undefined,
    icon: row.icon ?? undefined,
    termType: row.term_type ?? "attribute",
    parentId: row.parent_id ?? null,
    level: row.level ?? 1,
    sortOrder: row.sort_order ?? 0,
    isPublicFilter: !!row.is_public_filter,
    isActive: row.is_active !== false,
  };
}

/**
 * Convert a fallback hardcoded TaxonomyParent into a LiveTaxonomyParent
 * shape so callers don't have to branch on `source`.
 */
function fromHardcoded(parent: TaxonomyParent): LiveTaxonomyParent {
  const raw: LiveTaxonomyTerm = {
    id: `prototype:${parent.id}`,
    slug: parent.id,
    label: parent.label,
    icon: parent.emoji,
    termType: "parent_category",
    parentId: null,
    level: 1,
    sortOrder: 0,
    isPublicFilter: true,
    isActive: true,
  };
  const talentTypes: LiveTaxonomyTerm[] = parent.children.map((c) => ({
    id: `prototype:${parent.id}/${c.id}`,
    slug: c.id,
    label: c.label,
    termType: "talent_type",
    parentId: raw.id,
    level: 3,
    sortOrder: 0,
    isPublicFilter: false,
    isActive: true,
  }));
  return { display: parent, raw, talentTypes };
}

/**
 * Build a display TaxonomyParent from a live parent_category row + its
 * talent_type descendants. Compresses the category_group layer (we just
 * list the talent_types flat).
 */
function toDisplay(parent: LiveTaxonomyTerm, talentTypes: LiveTaxonomyTerm[]): TaxonomyParent {
  const hint = PARENT_DISPLAY_HINT[parent.slug] ?? { emoji: parent.icon ?? "•", helper: "" };
  return {
    // The display id has to be assignable to TaxonomyParentId. Since the
    // prototype's TaxonomyParentId is a fixed union, we cast — every
    // downstream consumer keys by string anyway.
    id: parent.slug as TaxonomyParentId,
    label: parent.label,
    emoji: parent.icon ?? hint.emoji,
    helper: hint.helper,
    minPlan: "free",
    children: talentTypes.map(t => ({
      id: t.slug,
      label: t.label,
    })),
  };
}

/**
 * Fetches the live taxonomy. Returns a memoized result with
 * { visibleParents (is_public_filter=TRUE, ≈8) } and
 * { restParents (the other ≈11 used for the "More…" expander) }.
 */
export function useLiveTaxonomy(): LiveTaxonomyResult {
  const [state, setState] = useState<{
    source: "live" | "fallback" | null;
    rows: LiveTaxonomyTerm[] | null;
    error: string | null;
  }>({ source: null, rows: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const sb = createClient();
    if (!sb) {
      // No env / no Supabase configured — synthesize from the hardcoded
      // TAXONOMY so the prototype still works in pure-design mode.
      setState({ source: "fallback", rows: [], error: null });
      return;
    }

    (async () => {
      // Pull every parent_category + every talent_type row in one call
      // (≤ ~270 rows). We reshape client-side; cheaper than two queries.
      const { data, error } = await sb
        .from("taxonomy_terms")
        .select("id, slug, name_en, plural_name, icon, term_type, parent_id, level, sort_order, is_public_filter, is_active")
        .in("term_type", ["parent_category", "category_group", "talent_type"])
        .eq("is_active", true)
        .is("archived_at", null)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      if (error || !data) {
        setState({ source: "fallback", rows: [], error: error?.message ?? "load failed" });
        return;
      }
      setState({ source: "live", rows: data.map(rowToTerm), error: null });
    })().catch((e) => {
      if (cancelled) return;
      setState({ source: "fallback", rows: [], error: String(e) });
    });

    return () => { cancelled = true; };
  }, []);

  return useMemo<LiveTaxonomyResult>(() => {
    if (state.source === null) {
      return { source: null, visibleParents: [], restParents: [], loading: true, error: null };
    }

    if (state.source === "fallback") {
      const all = TAXONOMY.map(fromHardcoded);
      // Match the 8/11 cut from `is_public_filter` — for the fallback we
      // approximate by treating the first 8 (which are minPlan=free or
      // studio in the hardcoded list) as visible.
      const visible = all.slice(0, 8);
      const rest = all.slice(8);
      return {
        source: "fallback", visibleParents: visible, restParents: rest,
        loading: false, error: state.error,
      };
    }

    // Live data — reshape into parents + their flattened talent_types.
    const rows = state.rows ?? [];
    const parents = rows.filter(r => r.termType === "parent_category");
    const groups  = rows.filter(r => r.termType === "category_group");
    const types   = rows.filter(r => r.termType === "talent_type");

    // Build groupId → talent_types[] index, then walk parent → its groups → their types.
    const typesByGroup = new Map<string, LiveTaxonomyTerm[]>();
    for (const t of types) {
      if (!t.parentId) continue;
      if (!typesByGroup.has(t.parentId)) typesByGroup.set(t.parentId, []);
      typesByGroup.get(t.parentId)!.push(t);
    }
    const groupsByParent = new Map<string, LiveTaxonomyTerm[]>();
    for (const g of groups) {
      if (!g.parentId) continue;
      if (!groupsByParent.has(g.parentId)) groupsByParent.set(g.parentId, []);
      groupsByParent.get(g.parentId)!.push(g);
    }

    const built: LiveTaxonomyParent[] = parents.map(p => {
      const childGroups = groupsByParent.get(p.id) ?? [];
      const flatTypes: LiveTaxonomyTerm[] = childGroups
        .flatMap(g => typesByGroup.get(g.id) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder);
      // ALSO accept talent_types whose parent_id is the parent_category
      // directly (some rows skip the category_group layer).
      const directTypes = (typesByGroup.get(p.id) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const allTypes = [...flatTypes, ...directTypes];
      return { raw: p, talentTypes: allTypes, display: toDisplay(p, allTypes) };
    }).sort((a, b) => a.raw.sortOrder - b.raw.sortOrder);

    const visible = built.filter(p => p.raw.isPublicFilter);
    const rest    = built.filter(p => !p.raw.isPublicFilter);

    return {
      source: "live", visibleParents: visible, restParents: rest,
      loading: false, error: null,
    };
  }, [state]);
}
