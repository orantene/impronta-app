/**
 * Which `talent_offerings` rows a WORKSPACE reader (site menu blocks, setup
 * checklist) counts as the workspace's own.
 *
 *   1. house rows: owner_kind = 'workspace' and tenant_id = this workspace;
 *   2. owner-provider rows: owner_kind = 'talent', tenant_id = this workspace
 *      AND talent_profile_id belongs to an ACTIVE member of this workspace's
 *      roster. Onboarding writes these for "both" and for a solo business
 *      owner (TUL-77b), so the business site sees them without a second copy.
 *
 * Tenant scoping stays strict: tenant_id must match in every case.
 */

type RosterClient = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): { eq(col: string, v: string): PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
};

/** Pure: does this row count as the workspace's own? */
export function isWorkspaceOfferingRow(
  row: { tenant_id?: string | null; owner_kind?: string | null; talent_profile_id?: string | null },
  tenantId: string,
  memberTalentIds: ReadonlySet<string>,
): boolean {
  if (!tenantId || row.tenant_id !== tenantId) return false;
  if (row.owner_kind === "workspace") return true;
  return row.owner_kind === "talent" && !!row.talent_profile_id && memberTalentIds.has(row.talent_profile_id);
}

/** Active roster talent ids of the workspace (empty on error: house rows only). */
export async function fetchActiveMemberTalentIds(client: unknown, tenantId: string): Promise<Set<string>> {
  const { data, error } = await (client as RosterClient)
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as Array<{ talent_profile_id: string | null }>).map((r) => r.talent_profile_id).filter((x): x is string => !!x));
}

/** PostgREST `.or()` expression matching the same rows as the predicate (the caller still `.eq`s tenant_id). */
export function workspaceOfferingOrFilter(memberTalentIds: ReadonlySet<string>): string {
  const ids = [...memberTalentIds].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return ids.length
    ? `owner_kind.eq.workspace,and(owner_kind.eq.talent,talent_profile_id.in.(${ids.join(",")}))`
    : "owner_kind.eq.workspace";
}
