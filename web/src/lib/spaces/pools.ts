/**
 * Binding a space to a capacity pool — the one place SS-1 is enforced in code.
 *
 * WHAT THIS OWNS AND WHAT IT DOES NOT
 * It creates and deactivates pools THROUGH the capacity engine's RPC. It never
 * inserts a pool row (there is no INSERT policy on `capacity_pools`, so it could
 * not), never writes an allocation, and never reserves, commits or releases.
 * Those are the Capacity Engine Manager's, and calling their RPC is the whole of
 * my side of the contract.
 *
 * INVARIANT SS-1 IS ENFORCED HERE, because it can be enforced nowhere else.
 * `pool_path` is built from whatever `parent_pool_id` the engine is handed and
 * is correct by construction for every value it could receive, so no row ever
 * looks wrong to it. If a table's pool points at the venue because an area and
 * a section were walked past, the room under-counts that table forever and
 * silently. `nearestPooledAncestorId` in ./tree.ts computes the right answer;
 * this module is what actually passes it.
 *
 * DEACTIVATE, NEVER DELETE (the Capacity Engine Manager's rule, and their
 * reasoning): `subject_id` is polymorphic so there is no cascade, and the
 * allocations on a pool are the record of what was sold in that room — a
 * dispute is settled with them. An inactive pool refuses every reserve through
 * it with `pool_inactive`, INCLUDING for its children, which is exactly what a
 * room going out of service should do.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isPooledKind, nearestPooledAncestorId, type SpaceNode } from "./tree";

/** The subset of a space row this module needs. */
export type BindableSpace = SpaceNode & {
  tenantId: string;
  /** Units this space sells. A table or a seat is 1; a room is its capacity. */
  unitsTotal: number;
  /** The workspace's word for the thing, for the engine's `unit_label`. */
  unitLabel?: string | null;
};

type PoolIdBySpaceId = Map<string, string>;

/**
 * Create or update the pool for one space, parented per SS-1.
 *
 * `known` carries the pool ids already resolved in this pass, so a tree can be
 * bound root-first without a round trip per ancestor. A space whose kind is
 * unpooled (area, section) is a no-op rather than an error: the caller walks a
 * whole tree and should not have to filter first.
 */
export async function bindSpacePool(
  space: BindableSpace,
  nodes: readonly SpaceNode[],
  known: PoolIdBySpaceId,
): Promise<string | null> {
  if (!isPooledKind(space.kind)) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const parentSpaceId = nearestPooledAncestorId(nodes, space.id);
  // A parent we cannot resolve is NOT the same as "no parent". Binding it to
  // null would silently detach the space from its room's capacity, which is the
  // SS-1 failure exactly. Refuse instead.
  if (parentSpaceId !== null && !known.has(parentSpaceId)) {
    logServerError(
      "spaces/bindSpacePool",
      `SS-1: parent pool for ${parentSpaceId} not resolved before child ${space.id}; bind root-first`,
    );
    return null;
  }

  const { data, error } = await admin.rpc("upsert_capacity_pool", {
    p_tenant_id: space.tenantId,
    p_subject_kind: "space",
    p_subject_id: space.id,
    p_units_total: space.unitsTotal,
    p_pool_key: "default",
    p_parent_pool_id: parentSpaceId ? known.get(parentSpaceId) ?? null : null,
    p_unit_label: space.unitLabel ?? null,
    p_is_active: true,
  });

  if (error) {
    logServerError("spaces/bindSpacePool", error);
    return null;
  }
  const poolId = typeof data === "string" ? data : null;
  if (poolId) known.set(space.id, poolId);
  return poolId;
}

/**
 * Bind a whole tree, parents before children.
 *
 * Depth order matters and is not cosmetic: the engine refuses a `parent_pool_id`
 * that does not exist yet, and SS-1 needs each child to see its ancestor's pool
 * id. Sorting by depth is what makes one pass sufficient.
 */
export async function bindTreePools(
  spaces: readonly BindableSpace[],
): Promise<{ bound: number; skipped: number; failed: number }> {
  const nodes: SpaceNode[] = spaces.map((s) => ({
    id: s.id,
    kind: s.kind,
    parentId: s.parentId,
  }));
  const known: PoolIdBySpaceId = new Map();
  const byId = new Map(spaces.map((s) => [s.id, s]));

  const depthOf = (id: string): number => {
    let depth = 0;
    let cursor = byId.get(id)?.parentId ?? null;
    const seen = new Set<string>([id]);
    while (cursor !== null && !seen.has(cursor)) {
      seen.add(cursor);
      depth += 1;
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    return depth;
  };

  const ordered = [...spaces].sort((a, b) => depthOf(a.id) - depthOf(b.id));

  let bound = 0;
  let skipped = 0;
  let failed = 0;
  for (const space of ordered) {
    if (!isPooledKind(space.kind)) {
      skipped += 1;
      continue;
    }
    const poolId = await bindSpacePool(space, nodes, known);
    if (poolId) bound += 1;
    else failed += 1;
  }
  return { bound, skipped, failed };
}

/**
 * Take a space out of service: deactivate its pool, never delete it.
 *
 * An inactive pool refuses reserves through it for the space AND its children,
 * so closing a room closes every table in it without touching them.
 */
export async function deactivateSpacePool(
  tenantId: string,
  spaceId: string,
): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { error } = await admin
    .from("capacity_pools")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("subject_kind", "space")
    .eq("subject_id", spaceId);
  if (error) {
    logServerError("spaces/deactivateSpacePool", error);
    return false;
  }
  return true;
}
