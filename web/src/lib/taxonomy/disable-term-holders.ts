/**
 * Switch-off path for tenant taxonomy terms that still have roster holders.
 *
 * Decision (TUL-443): HIDE — clear this tenant's `talent_profile_taxonomy`
 * rows for the term (and descendants), then disable. Never leave orphans that
 * smoke/deploy can warn about, and never touch another tenant's rows.
 */

export type TenantTaxonomyAssignment = {
  talent_profile_id: string;
  taxonomy_term_id: string;
  tenant_id: string | null;
};

/** Term id plus every descendant, breadth-first, depth-capped. */
export function collectSubtreeTermIds(
  rootId: string,
  childrenOf: ReadonlyMap<string, readonly string[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let frontier = [rootId];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      for (const child of childrenOf.get(id) ?? []) next.push(child);
    }
    frontier = next;
  }
  return out;
}

/**
 * Roster talent on this tenant who still hold any of the given terms via a
 * tenant-scoped assignment (`tenant_id` match). Legacy null-tenant rows are
 * included so old data is not left behind when a type is switched off.
 */
export function holderProfileIdsForTerms(input: {
  termIds: ReadonlySet<string>;
  assignments: readonly TenantTaxonomyAssignment[];
  rosterProfileIds: ReadonlySet<string>;
  tenantId: string;
}): string[] {
  const holders = new Set<string>();
  for (const row of input.assignments) {
    if (!input.termIds.has(row.taxonomy_term_id)) continue;
    if (!input.rosterProfileIds.has(row.talent_profile_id)) continue;
    if (row.tenant_id != null && row.tenant_id !== input.tenantId) continue;
    holders.add(row.talent_profile_id);
  }
  return [...holders].sort();
}

/** Server/UI copy when disable is blocked until the admin confirms hide. */
export function disableHoldersBlockedMessage(holderCount: number): string {
  const n = Math.max(0, Math.floor(holderCount));
  if (n === 1) {
    return (
      "1 person on your roster still has this service type. " +
      "Confirm to hide it for them (removes it from their profile on this workspace), or cancel and migrate them first."
    );
  }
  return (
    `${n} people on your roster still have this service type. ` +
    "Confirm to hide it for them (removes it from their profiles on this workspace), or cancel and migrate them first."
  );
}

export function disableHoldersClearedMessage(holderCount: number): string {
  const n = Math.max(0, Math.floor(holderCount));
  if (n === 1) {
    return "Service type turned off. Hidden for 1 person on this workspace.";
  }
  return `Service type turned off. Hidden for ${n} people on this workspace.`;
}

/** Stable error code the admin UI uses to offer the confirm-and-clear retry. */
export const DISABLE_HOLDERS_CODE = "taxonomy_disable_has_holders" as const;
