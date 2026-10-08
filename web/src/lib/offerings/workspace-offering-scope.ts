import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOwnerTalentProfileId } from "@/lib/saas/ensure-self-roster";

/**
 * Which `talent_offerings` rows a WORKSPACE reader (site menu blocks, setup
 * checklist) counts as the workspace's own.
 *
 *   1. house rows: owner_kind = 'workspace' and tenant_id = this workspace;
 *   2. owner-provider rows: owner_kind = 'talent', tenant_id = this workspace
 *      AND talent_profile_id is the talent profile of the workspace's active
 *      OWNER (agency_memberships role owner), never a mere roster talent. Onboarding writes these for "both" and for a solo business
 *      owner (TUL-77b), so the business site sees them without a second copy.
 *
 * Tenant scoping stays strict: tenant_id must match in every case.
 */

/** Pure: does this row count as the workspace's own? */
export function isWorkspaceOfferingRow(
  row: { tenant_id?: string | null; owner_kind?: string | null; talent_profile_id?: string | null },
  tenantId: string,
  ownerTalentIds: ReadonlySet<string>,
): boolean {
  if (!tenantId || row.tenant_id !== tenantId) return false;
  if (row.owner_kind === "workspace") return true;
  return row.owner_kind === "talent" && !!row.talent_profile_id && ownerTalentIds.has(row.talent_profile_id);
}

/**
 * Talent ids whose talent-owned rows count as the workspace's own: ONLY the
 * workspace's active OWNER's talent profile (the same owner rule onboarding
 * uses for the solo owner-provider, `resolveOwnerTalentProfileId`). Roster
 * talents are NOT included: an agency's roster talents keep personal offerings
 * that must never surface on the agency's site menu or checklist.
 */
export async function fetchOwnerTalentIds(
  client: unknown,
  tenantId: string,
  resolve: (admin: SupabaseClient, tenantId: string) => Promise<string | null> = resolveOwnerTalentProfileId,
): Promise<Set<string>> {
  const id = await resolve(client as SupabaseClient, tenantId);
  return id ? new Set([id]) : new Set();
}

/** PostgREST `.or()` expression matching the same rows as the predicate (the caller still `.eq`s tenant_id). */
export function workspaceOfferingOrFilter(ownerTalentIds: ReadonlySet<string>): string {
  const ids = [...ownerTalentIds].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return ids.length
    ? `owner_kind.eq.workspace,and(owner_kind.eq.talent,talent_profile_id.in.(${ids.join(",")}))`
    : "owner_kind.eq.workspace";
}
