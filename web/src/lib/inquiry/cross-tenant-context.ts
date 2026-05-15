/**
 * cross-tenant-context — D5 helper for rendering "this inquiry has
 * talents routed across multiple workspaces" context in admin + client UI.
 *
 * Backed by two SQL helpers introduced in migration
 * 20260515180511_d5_cross_tenant_participant_rls.sql:
 *
 *   - is_cross_tenant_inquiry(inquiry_id) → boolean
 *   - owning_parties_for_inquiry(inquiry_id) → SETOF (type, id, count)
 *
 * Both run SECURITY DEFINER so the caller's RLS doesn't gate the
 * read — but the calling user is still authenticated. We use the
 * service-role client when we want the data unconditionally (admin
 * shell viewing a multi-tenant inquiry the admin only partially owns).
 *
 * Single-tenant inquiries (the dominant pre-launch case) return:
 *   { isCrossTenant: false, parties: [{ type: 'workspace', id: tenant, count: N }] }
 *
 * Discover-originated multi-tenant inquiries (D5 future) return:
 *   { isCrossTenant: true, parties: [
 *       { type: 'agency', id: hubMilanId, count: 2 },
 *       { type: 'agency', id: hubBerlinId, count: 1 },
 *       { type: 'talent', id: independentTalentId, count: 1 },
 *   ] }
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type OwningPartyRow = {
  owningPartyType: "agency" | "workspace" | "talent";
  owningPartyId: string;
  talentCount: number;
};

export type CrossTenantContext = {
  isCrossTenant: boolean;
  /** One row per distinct owning party with its talent participant count.
   *  Always at least 1 entry for any inquiry that has at least one talent
   *  row with an owning_party set. Empty for inquiries with no talents. */
  parties: OwningPartyRow[];
};

/**
 * Load the cross-tenant context for a single inquiry. Falls back to
 * `{ isCrossTenant: false, parties: [] }` on any DB error so callers
 * can safely render a single-tenant view by default.
 */
export async function loadCrossTenantContext(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<CrossTenantContext> {
  try {
    const [crossResult, partiesResult] = await Promise.all([
      supabase.rpc("is_cross_tenant_inquiry", { p_inquiry_id: inquiryId }),
      supabase.rpc("owning_parties_for_inquiry", { p_inquiry_id: inquiryId }),
    ]);

    const isCrossTenant = crossResult.error
      ? false
      : Boolean(crossResult.data);

    type PartyRow = {
      owning_party_type: "agency" | "workspace" | "talent";
      owning_party_id: string;
      talent_count: number;
    };

    const parties: OwningPartyRow[] = partiesResult.error
      ? []
      : ((partiesResult.data ?? []) as PartyRow[]).map((r) => ({
          owningPartyType: r.owning_party_type,
          owningPartyId: r.owning_party_id,
          talentCount: r.talent_count,
        }));

    return { isCrossTenant, parties };
  } catch {
    return { isCrossTenant: false, parties: [] };
  }
}

/**
 * Compose a short, plain-language label for the cross-tenant context.
 * Used in admin shell badges + client lineup summary.
 *
 * Examples:
 *   - single-tenant, 3 talents      → null  (no badge needed)
 *   - 2 agencies, 3 talents total   → "Routed to 2 workspaces"
 *   - 1 agency + 1 independent      → "Routed to 1 workspace + 1 independent"
 */
export function describeCrossTenantContext(ctx: CrossTenantContext): string | null {
  if (!ctx.isCrossTenant) return null;
  const workspaceCount = ctx.parties.filter(
    (p) => p.owningPartyType === "agency" || p.owningPartyType === "workspace",
  ).length;
  const independentCount = ctx.parties.filter((p) => p.owningPartyType === "talent").length;

  const segments: string[] = [];
  if (workspaceCount > 0) {
    segments.push(`${workspaceCount} workspace${workspaceCount === 1 ? "" : "s"}`);
  }
  if (independentCount > 0) {
    segments.push(`${independentCount} independent`);
  }
  return `Routed to ${segments.join(" + ")}`;
}
