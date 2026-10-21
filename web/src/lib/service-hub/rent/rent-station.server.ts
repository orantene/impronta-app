import "server-only";

/**
 * TUL-1465: release a member's station hold. Removes ONLY the station from the member's offerings in this
 * workspace (other linked resources stay) and clears it on the plan. Direct attribute edit: unlinking needs no
 * pool changes, and the member (not workspace staff) triggers it when they end their own plan.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOfferingResourceSet } from "@/lib/resources/offering-resource-set";
import { planSpacePoolForLink, type ExistingPool } from "@/lib/resources/space-pool-for-link";
import type { SpaceKind, SpaceNode } from "@/lib/spaces/tree";
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

/**
 * TUL-1600: the station's capacity pool must exist as soon as it is assigned, even when the member has no offering
 * yet, so an offering created later can hold the station without ever linking a space that has no pool (the engine's
 * rule: a link never exists without its pool). Same plan and same engine function as the offering link.
 */
export async function ensureStationPool(
  admin: SupabaseClient,
  p: { tenantId: string; spaceId: string },
): Promise<{ ok: true } | { ok: false }> {
  try {
    const [{ data: spaceRows, error: spErr }, { data: poolRows, error: poolErr }] = await Promise.all([
      tenantScopedQuery(admin, "spaces", p.tenantId).select("id, kind, parent_id, name"),
      tenantScopedQuery(admin, "capacity_pools", p.tenantId).select("id, subject_id, units_total, parent_pool_id").eq("subject_kind", "space").eq("pool_key", "default"),
    ]);
    if (spErr || poolErr) {
      logServerError("rent.ensureStationPool.read", spErr ?? poolErr);
      return { ok: false };
    }
    const rows = (spaceRows ?? []) as Array<{ id: string; kind: SpaceKind; parent_id: string | null; name: string }>;
    const nodes: SpaceNode[] = rows.map((r) => ({ id: r.id, kind: r.kind, parentId: r.parent_id }));
    const pools = new Map<string, ExistingPool>(
      ((poolRows ?? []) as Array<{ id: string; subject_id: string; units_total: number; parent_pool_id: string | null }>).map((x) => [
        x.subject_id,
        { id: x.id, unitsTotal: x.units_total, parentPoolId: x.parent_pool_id },
      ]),
    );
    const plan = planSpacePoolForLink({ spaceId: p.spaceId, nodes, pools });
    if (plan.action === "refuse") return { ok: false };
    if (plan.action === "use") return { ok: true };
    const { error } = await admin.rpc("upsert_capacity_pool", {
      p_tenant_id: p.tenantId,
      p_subject_kind: "space",
      p_subject_id: p.spaceId,
      p_units_total: plan.units,
      p_pool_key: "default",
      p_parent_pool_id: plan.parentPoolId,
      p_unit_label: rows.find((r) => r.id === p.spaceId)?.name ?? null,
      p_is_active: true,
    });
    if (error) {
      logServerError("rent.ensureStationPool.write", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("rent.ensureStationPool", err);
    return { ok: false };
  }
}
