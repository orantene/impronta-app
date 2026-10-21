import "server-only";

/**
 * TUL-1465: release a member's station hold. Removes ONLY the station from the member's offerings in this
 * workspace (other linked resources stay) and clears it on the plan. Direct attribute edit: unlinking needs no
 * pool changes, and the member (not workspace staff) triggers it when they end their own plan.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOfferingResourceSet } from "@/lib/resources/offering-resource-set";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { mergeStationSpaceIds } from "./rent-station";

export async function releaseStationHold(
  admin: SupabaseClient,
  p: { tenantId: string; planId: string; talentProfileId: string },
): Promise<void> {
  try {
    const { data: plan } = await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId).select("station_resource_id").eq("id", p.planId).maybeSingle();
    const station = (plan as { station_resource_id?: string | null } | null)?.station_resource_id ?? null;
    if (!station) return;
    const { data: offerings, error } = await tenantScopedQuery(admin, "talent_offerings", p.tenantId)
      .select("id, attributes")
      .eq("talent_profile_id", p.talentProfileId);
    if (error) {
      logServerError("rent.releaseStation.read", error);
      return;
    }
    let failed = false;
    for (const o of (offerings ?? []) as Array<{ id: string; attributes: unknown }>) {
      const set = parseOfferingResourceSet(o.attributes);
      if (!set.spaceIds.includes(station)) continue;
      const attrs = (o.attributes && typeof o.attributes === "object" ? o.attributes : {}) as Record<string, unknown>;
      const prev = (attrs.resourceSet && typeof attrs.resourceSet === "object" ? attrs.resourceSet : {}) as Record<string, unknown>;
      const nextSet = { ...prev, spaceIds: mergeStationSpaceIds(set.spaceIds, station, null) };
      delete (nextSet as { spaceId?: unknown }).spaceId;
      const { error: wErr } = await tenantScopedQuery(admin, "talent_offerings", p.tenantId)
        .update({ attributes: { ...attrs, resourceSet: nextSet } })
        .eq("id", o.id);
      if (wErr) {
        failed = true;
        logServerError("rent.releaseStation.write", wErr);
      }
    }
    // Keep the plan's pointer when any offering still holds it, so a retry can finish the release.
    if (!failed) {
      await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId).update({ station_resource_id: null }).eq("id", p.planId);
    }
  } catch (err) {
    logServerError("rent.releaseStation", err);
  }
}
