"use server";

/**
 * TUL-1465: the owner picks the station a renting member sits at. It is linked to every offering the member
 * sells in this workspace through the resource engine's own action (TUL-1375), which also creates the 1-unit
 * pool, so each booking of the member holds the station. Owner only; only for a member who accepted.
 */
import { revalidatePath } from "next/cache";
import { logWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { parseOfferingResourceSet } from "@/lib/resources/offering-resource-set";
import { setOfferingResourcesAction } from "@/lib/resources/offering-resources-actions";
import { logServerError } from "@/lib/server/safe-error";
import { isPooledKind, type SpaceKind } from "@/lib/spaces/tree";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { ownerGuard } from "./rent-owner.server";
import { decideStationChange, mergeStationSpaceIds } from "./rent-station";

export type SetStationResult =
  | { ok: true; linkedOfferings: number }
  | { ok: false; reason: "unauthenticated" | "owner_only" | "not_found" | "plan_not_accepted" | "space_not_found" | "space_not_bookable" | "link_failed" | "unavailable" };

const UUID = /^[0-9a-f-]{36}$/i;

export async function setRentPlanStation(input: { planId: string; spaceId: string | null }): Promise<SetStationResult> {
  await requireNotImpersonating();
  try {
    const g = await ownerGuard();
    if (!g.ok) return g;
    if (!UUID.test(input.planId) || (input.spaceId !== null && !UUID.test(input.spaceId))) return { ok: false, reason: "not_found" };

    const { data: plan } = await tenantScopedQuery(g.admin, "studio_rent_plans", g.tenantId)
      .select("id, status, talent_profile_id, station_resource_id")
      .eq("id", input.planId)
      .maybeSingle();
    const p = plan as { id: string; status: string; talent_profile_id: string; station_resource_id: string | null } | null;
    if (!p) return { ok: false, reason: "not_found" };

    let spaceInWorkspace = true;
    let spaceBookable = true;
    if (input.spaceId) {
      const { data: space } = await tenantScopedQuery(g.admin, "spaces", g.tenantId).select("id, kind").eq("id", input.spaceId).maybeSingle();
      spaceInWorkspace = Boolean(space);
      spaceBookable = space ? isPooledKind((space as { kind: SpaceKind }).kind) : false;
    }
    // Clearing a station is always allowed for a plan that exists; assigning needs the accepted plan.
    if (input.spaceId) {
      const decision = decideStationChange({ planStatus: p.status, spaceInWorkspace, spaceBookable });
      if (!decision.ok) return decision;
    }

    const { data: offerings, error } = await tenantScopedQuery(g.admin, "talent_offerings", g.tenantId)
      .select("id, attributes")
      .eq("talent_profile_id", p.talent_profile_id);
    if (error) {
      logServerError("rent.setStation.read", error);
      return { ok: false, reason: "unavailable" };
    }
    let linked = 0;
    for (const o of (offerings ?? []) as Array<{ id: string; attributes: unknown }>) {
      const current = parseOfferingResourceSet(o.attributes).spaceIds;
      const next = mergeStationSpaceIds(current, p.station_resource_id, input.spaceId);
      if (next.length === current.length && next.every((id, i) => id === current[i])) {
        linked += input.spaceId ? 1 : 0;
        continue;
      }
      const r = await setOfferingResourcesAction(g.tenantId, o.id, next);
      if (!r.ok) {
        logServerError("rent.setStation.link", r.error);
        return { ok: false, reason: "link_failed" }; // the plan keeps its old pointer; running it again converges
      }
      linked += 1;
    }
    const { error: upErr } = await tenantScopedQuery(g.admin, "studio_rent_plans", g.tenantId)
      .update({ station_resource_id: input.spaceId, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (upErr) {
      logServerError("rent.setStation.plan", upErr);
      return { ok: false, reason: "unavailable" };
    }
    await logWorkspaceAudit({
      tenantId: g.tenantId,
      category: "roster",
      action: "workspace.rent_plan.station",
      summary: input.spaceId ? "Assigned a station to a renting member" : "Cleared a renting member's station",
      targetType: "studio_rent_plan",
      targetId: p.id,
      metadata: { from: p.station_resource_id, to: input.spaceId, offerings: linked },
    });
    revalidatePath("/", "layout");
    return { ok: true, linkedOfferings: linked };
  } catch (err) {
    logServerError("rent.setStation", err);
    return { ok: false, reason: "unavailable" };
  }
}
