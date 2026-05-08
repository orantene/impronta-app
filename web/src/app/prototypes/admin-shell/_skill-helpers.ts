// ============================================================================
// _skill-helpers.ts — Pure helpers extracted from _skill-slot-panel during
// the Phase 2 refactor. Pure functions only — no React, no DOM.
// ============================================================================

import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";

export type SkillGroup = {
  parent_id: string;
  parent_name: string;
  role: "primary_role" | "secondary_role";
  skills: ResolvedSkill[];
};

/**
 * Group a flat list of resolved skills by (relationship_type, parent_category).
 * Returns a Map keyed by `${relationship_type}|${parent_category_id}`. Order
 * within each group reflects insertion order from the input list (which is
 * already sorted by display_order at the server-action layer).
 */
export function groupSkillsByRoleParent(
  skills: ResolvedSkill[],
): Map<string, SkillGroup> {
  const m = new Map<string, SkillGroup>();
  for (const s of skills) {
    const key = `${s.relationship_type}|${s.parent_category_id ?? ""}`;
    if (!m.has(key)) {
      m.set(key, {
        parent_id: s.parent_category_id ?? "",
        parent_name: s.parent_category_name_en ?? "Unknown",
        role: s.relationship_type,
        skills: [],
      });
    }
    m.get(key)!.skills.push(s);
  }
  return m;
}

/**
 * Pick the featured skill (lowest display_order across all skills).
 * Returns the term_id, or null when the list is empty.
 */
export function pickFeaturedSkillTermId(
  skills: ResolvedSkill[] | null,
): string | null {
  if (!skills || skills.length === 0) return null;
  const sorted = [...skills].sort((a, b) => a.display_order - b.display_order);
  return sorted[0]?.skill_term_id ?? null;
}

/**
 * Count distinct secondary parent_categories in a flat skill list.
 * Used to enforce the "≤2 secondary categories" cap in the picker UI.
 */
export function countSecondaryParents(skills: ResolvedSkill[] | null): number {
  if (!skills) return 0;
  const set = new Set<string>();
  for (const s of skills) {
    if (s.relationship_type === "secondary_role" && s.parent_category_id) {
      set.add(s.parent_category_id);
    }
  }
  return set.size;
}
