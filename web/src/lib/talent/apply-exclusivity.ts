/**
 * TUL-1924: exclusivity binds only through the talent's PRIMARY roster row.
 * `agency_talent_roster.exclusivity_status` is the lifecycle of the is_primary flag, but it defaults
 * to 'confirmed' on every row, so non-primary rows (hub, secondary studios) must never block applying.
 * Mirrors the `taa_talent_insert` RLS predicate (migration 20261231418300).
 */

export type ExclusivityRosterRow = {
  tenant_id: string;
  is_primary: boolean;
  status: string;
  exclusivity_status: string;
};

/** True when this roster row stops the talent applying to `targetTenantId`. */
export function rosterRowBlocksApply(row: ExclusivityRosterRow, targetTenantId: string): boolean {
  return (
    row.is_primary === true &&
    row.tenant_id !== targetTenantId &&
    (row.exclusivity_status === "confirmed" || row.exclusivity_status === "auto_assigned") &&
    row.status !== "removed" &&
    row.status !== "rejected"
  );
}

export function rosterBlocksApply(rows: readonly ExclusivityRosterRow[], targetTenantId: string): boolean {
  return rows.some((r) => rosterRowBlocksApply(r, targetTenantId));
}
