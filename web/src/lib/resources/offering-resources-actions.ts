"use server";

/**
 * TUL-1375 · Link a service to the shared resources it needs (chair, room, station, bed,
 * bay, vehicle or equipment unit). Stored on `talent_offerings.attributes.resourceSet
 * .spaceIds`; only spaces with a capacity pool can be linked, because only those can be
 * held. Workspace staff only, own workspace only.
 */
import { revalidatePath } from "next/cache";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { parseOfferingResourceSet } from "./offering-resource-set";

export type BookableResource = { id: string; name: string; kind: string };

export type ResourcesLoad =
  | { ok: true; resources: BookableResource[]; linked: string[] }
  | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

async function authorize(tenantId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false, error: staff.error };
  if (staff.tenantId !== tenantId) return { ok: false, error: "Not authorized for this workspace." };
  return { ok: true };
}

export async function loadOfferingResourcesAction(tenantId: string, offeringId: string): Promise<ResourcesLoad> {
  const auth = await authorize(tenantId);
  if (!auth.ok) return auth;
  if (!UUID.test(offeringId)) return { ok: false, error: "Service not found." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const [{ data: offering, error: offErr }, { data: pools, error: poolErr }] = await Promise.all([
    admin.from("talent_offerings").select("id, attributes").eq("id", offeringId).eq("tenant_id", tenantId).maybeSingle(),
    admin.from("capacity_pools").select("subject_id").eq("tenant_id", tenantId).eq("subject_kind", "space").eq("pool_key", "default"),
  ]);
  if (offErr || poolErr) {
    logServerError("resources.loadOfferingResources", offErr ?? poolErr);
    return { ok: false, error: "Could not load resources." };
  }
  if (!offering) return { ok: false, error: "Service not found." };
  const pooled = [...new Set(((pools ?? []) as Array<{ subject_id: string }>).map((p) => p.subject_id))];
  let resources: BookableResource[] = [];
  if (pooled.length > 0) {
    const { data: spaces, error: spErr } = await admin
      .from("spaces")
      .select("id, name, kind")
      .eq("tenant_id", tenantId)
      .in("id", pooled)
      .order("name", { ascending: true });
    if (spErr) {
      logServerError("resources.loadOfferingResources.spaces", spErr);
      return { ok: false, error: "Could not load resources." };
    }
    resources = (spaces ?? []) as BookableResource[];
  }
  const linked = parseOfferingResourceSet((offering as { attributes: unknown }).attributes).spaceIds;
  return { ok: true, resources, linked };
}

export async function setOfferingResourcesAction(
  tenantId: string,
  offeringId: string,
  spaceIds: string[],
): Promise<{ ok: true; linked: string[] } | { ok: false; error: string }> {
  const auth = await authorize(tenantId);
  if (!auth.ok) return auth;
  if (!UUID.test(offeringId) || !Array.isArray(spaceIds) || spaceIds.some((id) => !UUID.test(id)) || spaceIds.length > 20) {
    return { ok: false, error: "Invalid resources." };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const wanted = [...new Set(spaceIds)];
  if (wanted.length > 0) {
    // Only this workspace's spaces that have a pool (holdable).
    const { data: pools, error } = await admin
      .from("capacity_pools")
      .select("subject_id")
      .eq("tenant_id", tenantId)
      .eq("subject_kind", "space")
      .eq("pool_key", "default")
      .in("subject_id", wanted);
    if (error) {
      logServerError("resources.setOfferingResources.pools", error);
      return { ok: false, error: "Could not save resources." };
    }
    const ok = new Set(((pools ?? []) as Array<{ subject_id: string }>).map((p) => p.subject_id));
    if (wanted.some((id) => !ok.has(id))) return { ok: false, error: "A resource is not set up for booking." };
  }

  const { data: row, error: readErr } = await admin
    .from("talent_offerings")
    .select("id, attributes")
    .eq("id", offeringId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (readErr || !row) {
    if (readErr) logServerError("resources.setOfferingResources.read", readErr);
    return { ok: false, error: "Service not found." };
  }
  const attrs = ((row as { attributes: unknown }).attributes ?? {}) as Record<string, unknown>;
  const prev = (attrs.resourceSet && typeof attrs.resourceSet === "object" ? attrs.resourceSet : {}) as Record<string, unknown>;
  const nextSet = { ...prev, spaceIds: wanted };
  delete (nextSet as { spaceId?: unknown }).spaceId;
  const { error: writeErr } = await admin
    .from("talent_offerings")
    .update({ attributes: { ...attrs, resourceSet: nextSet } })
    .eq("id", offeringId)
    .eq("tenant_id", tenantId);
  if (writeErr) {
    logServerError("resources.setOfferingResources.write", writeErr);
    return { ok: false, error: "Could not save resources." };
  }
  revalidatePath("/", "layout");
  return { ok: true, linked: wanted };
}
