import {
  buildEnabledTermIds,
  type TenantCatalogScopeTerm,
} from "@/lib/field-engine/tenant-catalog-scope";

/**
 * Which talent_type terms a tenant picker may OFFER.
 *
 * Must stay a subset of what the write path accepts —
 * `evaluateTenantTalentTypeAvailability` (lib/talent-taxonomy-service.ts) is
 * the authority, and offering a term it will reject produces the worst UX in
 * this subsystem: the admin picks a type, saves, and gets an error about a
 * setting they cannot see. `tenant-talent-type-options.test.ts` pins the
 * parity between the two.
 *
 * Semantics mirrored from the validator:
 *  - term must be active (and, upstream, unarchived);
 *  - no explicit `is_enabled=false` row on the term or ANY ancestor
 *    ("no row = enabled" is the platform default);
 *  - for a primary-role picker, the parent_category gate (or the term itself
 *    when it has no parent_category ancestor) must not carry
 *    `allow_as_primary=false`.
 */

export type TenantTalentTypeOptionTerm = TenantCatalogScopeTerm & {
  term_type?: string | null;
};

export type TenantTalentTypeOptionSetting = {
  taxonomy_term_id: string;
  is_enabled: boolean | null;
  allow_as_primary?: boolean | null;
};

export function selectableTalentTypeIds(params: {
  terms: readonly TenantTalentTypeOptionTerm[];
  settings: readonly TenantTalentTypeOptionSetting[];
  talentTypeIds: readonly string[];
  /** The picker assigns the PRIMARY role (roster/new does). Default true. */
  forPrimaryRole?: boolean;
}): Set<string> {
  const { terms, settings, talentTypeIds } = params;
  const forPrimary = params.forPrimaryRole !== false;

  const enabled = buildEnabledTermIds(terms, settings);
  const termById = new Map(terms.map((t) => [t.id, t] as const));
  const settingByTermId = new Map(
    settings.map((s) => [s.taxonomy_term_id, s] as const),
  );

  const parentCategoryOf = (id: string): TenantTalentTypeOptionTerm | null => {
    let cur = termById.get(id);
    for (let depth = 0; cur && depth < 8; depth += 1) {
      if (cur.term_type === "parent_category") return cur;
      cur = cur.parent_id ? termById.get(cur.parent_id) : undefined;
    }
    return null;
  };

  const out = new Set<string>();
  for (const id of talentTypeIds) {
    if (!enabled.has(id)) continue;
    if (forPrimary) {
      // Mirror of the validator's gate: parent_category ancestor wins, the
      // term itself is the gate only when no parent_category exists.
      const gate = parentCategoryOf(id) ?? termById.get(id);
      if (gate && settingByTermId.get(gate.id)?.allow_as_primary === false) continue;
    }
    out.add(id);
  }
  return out;
}
