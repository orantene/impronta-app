/**
 * Which submitted skill terms a save must reject.
 *
 * Extracted from the two `setTalentProfileSkills*` server actions so the rule
 * is testable in isolation. It broke silently once (2026-08-16) and locked 19
 * profiles out of every skill edit; the regression suite lives next to this
 * file.
 *
 * THE RULE. The editor submits the talent's WHOLE membership set on every add
 * and every remove — it is not a delta. So the catalog-hygiene rules
 * (`is_active`, `is_generic_fallback`) may only gate terms the talent does not
 * already carry. Applying them to persisted rows makes an unrelated edit fail
 * because of a role that was seeded years ago, and — worse — makes the
 * offending role impossible to delete, because the removal payload still
 * contains the profile's other persisted terms.
 *
 * A persisted term therefore only has to still exist and still be a
 * `talent_type`; the `validate_talent_profile_taxonomy_relationship` trigger
 * enforces the latter on write regardless.
 */

export type SkillTermFacts = {
  slug: string;
  term_type: string;
  is_active: boolean;
  is_generic_fallback: boolean;
};

/**
 * @param desiredIds       every term id the client submitted (the full set)
 * @param termsById        catalog facts for those ids; a missing id = unknown term
 * @param persistedIds     term ids already on the profile — exempt from hygiene rules
 * @returns slugs (or raw ids, when the term is unknown) that must be rejected
 */
export function invalidSkillTerms(
  desiredIds: readonly string[],
  termsById: ReadonlyMap<string, SkillTermFacts>,
  persistedIds: ReadonlySet<string>,
): string[] {
  const invalid: string[] = [];
  for (const id of desiredIds) {
    const term = termsById.get(id);
    // Unknown or structurally wrong — always rejected, persisted or not.
    if (!term || term.term_type !== "talent_type") {
      invalid.push(term?.slug ?? id);
      continue;
    }
    // Grandfathered: already on the profile, so hygiene rules do not apply.
    if (persistedIds.has(id)) continue;
    if (!term.is_active || term.is_generic_fallback) invalid.push(term.slug);
  }
  return invalid;
}
