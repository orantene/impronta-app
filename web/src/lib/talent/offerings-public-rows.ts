/**
 * The row read behind loadPublicOfferingsForProfile (TUL-1272), split out so the
 * guest-visibility and tenant rules are tested against a fake table.
 *
 * Talent-owned rows only (`owner_kind = 'talent'`), D-10 guest-visible
 * (published + approved + public or on_request; on_request prints no price,
 * D-10a). `filterTenantId` null reads every tenant (the talent's own site, a
 * platform host, or a hub tenant, see publicOfferingsScope); otherwise the
 * agency's own rows only.
 */

import type { TalentOfferingRow } from "./offerings-types";
import { isHubProfileListableOffering } from "./hub-profile-offerings";

type Result = PromiseLike<{ data: unknown; error: unknown }>;
type RowsQuery = {
  select(columns: string): RowsQuery;
  eq(column: string, value: unknown): RowsQuery;
  in(column: string, values: unknown[]): RowsQuery;
  order(column: string, opts: { ascending: boolean }): Result;
};
export type PublicOfferingRowsDb = { from(table: string): RowsQuery };

export async function selectPublicOfferingRows(
  db: PublicOfferingRowsDb,
  talentProfileId: string,
  filterTenantId: string | null,
): Promise<{ ok: true; rows: TalentOfferingRow[] } | { ok: false; error: unknown }> {
  let query = db
    .from("talent_offerings")
    .select("*")
    .eq("talent_profile_id", talentProfileId)
    .eq("owner_kind", "talent")
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"]);
  if (filterTenantId) query = query.eq("tenant_id", filterTenantId);
  const { data, error } = await query.order("sort_order", { ascending: true });
  if (error) return { ok: false, error };
  // The same rule re-checked in code, so a widened query can never leak.
  const rows = ((data ?? []) as TalentOfferingRow[]).filter((r) => isHubProfileListableOffering(r));
  return { ok: true, rows };
}
