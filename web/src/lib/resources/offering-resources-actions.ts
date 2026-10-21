"use server";

/**
 * TUL-1375 · Link a service to the shared resources it needs (chair, room, station, bed,
 * bay, vehicle or equipment unit). Stored on `talent_offerings.attributes.resourceSet
 * .spaceIds`. Any bookable kind of space can be linked: a space with no capacity pool
 * gets a 1-unit pool in the same transaction as the link (PM: a barber with one chair
 * never needs to understand pools). Workspace staff only, own workspace only.
 */
import { revalidatePath } from "next/cache";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isPooledKind, type SpaceKind, type SpaceNode } from "@/lib/spaces/tree";
import { parseOfferingResourceSet } from "./offering-resource-set";
import { planSpacePoolForLink, type ExistingPool } from "./space-pool-for-link";

export type BookableResource = { id: string; name: string; kind: string };

export type ResourcesLoad =
  | { ok: true; resources: BookableResource[]; linked: string[] }
  | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * TUL-1708: the default guard capability (`agency.workspace.view`) is held by a `viewer`, so the WRITE
 * below passes this editor-tier capability explicitly; the read (load) passes nothing — a viewer may see
 * what is linked.
 */
const WRITE_CAPABILITY = "edit_talent_overlay" as const;

async function authorize(tenantId: string, capability?: typeof WRITE_CAPABILITY): Promise<{ ok: true } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const staff = await requireWorkspaceStaffAction(capability ? { capability } : undefined);
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

  const [{ data: offering, error: offErr }, { data: spaces, error: spErr }] = await Promise.all([
    admin.from("talent_offerings").select("id, attributes").eq("id", offeringId).eq("tenant_id", tenantId).maybeSingle(),
    admin.from("spaces").select("id, name, kind").eq("tenant_id", tenantId).order("name", { ascending: true }),
  ]);
  if (offErr || spErr) {
    logServerError("resources.loadOfferingResources", offErr ?? spErr);
    return { ok: false, error: "Could not load resources." };
  }
  if (!offering) return { ok: false, error: "Service not found." };
  // Bookable kinds only (a section or area cannot be held); pools are created on link.
  const resources = ((spaces ?? []) as BookableResource[]).filter((r) => isPooledKind(r.kind as SpaceKind));
  const linked = parseOfferingResourceSet((offering as { attributes: unknown }).attributes).spaceIds;
  return { ok: true, resources, linked };
}

export async function setOfferingResourcesAction(
  tenantId: string,
  offeringId: string,
  spaceIds: string[],
): Promise<{ ok: true; linked: string[] } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const auth = await authorize(tenantId, WRITE_CAPABILITY);
  if (!auth.ok) return auth;
  if (!UUID.test(offeringId) || !Array.isArray(spaceIds) || spaceIds.some((id) => !UUID.test(id)) || spaceIds.length > 20) {
    return { ok: false, error: "Invalid resources." };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const wanted = [...new Set(spaceIds)];

  const [{ data: spaceRows, error: spErr }, { data: poolRows, error: poolErr }] = await Promise.all([
    admin.from("spaces").select("id, kind, parent_id, name").eq("tenant_id", tenantId),
    admin
      .from("capacity_pools")
      .select("id, subject_id, units_total, parent_pool_id")
      .eq("tenant_id", tenantId)
      .eq("subject_kind", "space")
      .eq("pool_key", "default"),
  ]);
  if (spErr || poolErr) {
    logServerError("resources.setOfferingResources.read", spErr ?? poolErr);
    return { ok: false, error: "Could not save resources." };
  }
  const rows = (spaceRows ?? []) as Array<{ id: string; kind: SpaceKind; parent_id: string | null; name: string }>;
  const nodes: SpaceNode[] = rows.map((r) => ({ id: r.id, kind: r.kind, parentId: r.parent_id }));
  const pools = new Map<string, ExistingPool>(
    ((poolRows ?? []) as Array<{ id: string; subject_id: string; units_total: number; parent_pool_id: string | null }>).map((p) => [
      p.subject_id,
      { id: p.id, unitsTotal: p.units_total, parentPoolId: p.parent_pool_id },
    ]),
  );
  const toWrite: Array<{ space_id: string; parent_pool_id: string | null; units: number; unit_label: string | null }> = [];
  for (const spaceId of wanted) {
    const plan = planSpacePoolForLink({ spaceId, nodes, pools });
    if (plan.action === "refuse") return { ok: false, error: "That space cannot be booked by a service." };
    if (plan.action === "create" || plan.action === "raise") {
      toWrite.push({ space_id: spaceId, parent_pool_id: plan.parentPoolId, units: 1, unit_label: rows.find((r) => r.id === spaceId)?.name ?? null });
    }
  }

  // One transaction: pools + link (held RPC 20261231419500).
  const { data: linked, error: linkErr } = await admin.rpc("link_offering_resources", {
    p_tenant_id: tenantId,
    p_offering_id: offeringId,
    p_space_ids: wanted,
    p_pools: toWrite,
  });
  const missingRpc = linkErr && ["PGRST202", "42883"].includes(String((linkErr as { code?: string }).code));
  if (linkErr && !missingRpc) {
    logServerError("resources.setOfferingResources.link", linkErr);
    return { ok: false, error: "Could not save resources." };
  }
  if (!linkErr) {
    const reply = (linked ?? {}) as { ok?: boolean };
    if (reply.ok !== true) return { ok: false, error: "Could not save resources." };
    revalidatePath("/", "layout");
    return { ok: true, linked: wanted };
  }

  // Fallback while the held RPC is absent: pools first (idempotent), then the link, so a
  // link can never exist without its pool.
  for (const w of toWrite) {
    const { error } = await admin.rpc("upsert_capacity_pool", {
      p_tenant_id: tenantId,
      p_subject_kind: "space",
      p_subject_id: w.space_id,
      p_units_total: w.units,
      p_pool_key: "default",
      p_parent_pool_id: w.parent_pool_id,
      p_unit_label: w.unit_label,
      p_is_active: true,
    });
    if (error) {
      logServerError("resources.setOfferingResources.pool", error);
      return { ok: false, error: "Could not save resources." };
    }
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
