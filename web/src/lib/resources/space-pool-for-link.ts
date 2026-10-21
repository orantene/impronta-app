/**
 * TUL-1375 · PURE: what to do with a space's capacity pool when it is linked to a service.
 *
 * A barber with one chair must never need to understand pools (PM, 2026-10-19): linking
 * a space with no pool creates a 1-unit pool. SS-1 still holds: the new pool hangs under
 * the nearest ancestor that HAS a pool (an ancestor with no pool constrains nothing, so
 * it is skipped, never invented). An existing pool is used as is, except an empty 0-unit
 * pool on a space with nothing inside it, which becomes 1. A space that contains other
 * spaces (a room with tables) keeps its own capacity rules: refused, never changed here.
 */
import { isPooledKind, nearestPooledAncestorId, type SpaceNode } from "@/lib/spaces/tree";

export type ExistingPool = { id: string; unitsTotal: number; parentPoolId: string | null };

export type SpacePoolPlan =
  | { action: "use"; poolId: string }
  | { action: "create"; parentPoolId: string | null; units: 1 }
  | { action: "raise"; poolId: string; parentPoolId: string | null; units: 1 }
  | { action: "refuse" };

export function planSpacePoolForLink(input: {
  spaceId: string;
  nodes: readonly SpaceNode[];
  /** Existing default pools, by space id. */
  pools: ReadonlyMap<string, ExistingPool>;
}): SpacePoolPlan {
  const node = input.nodes.find((n) => n.id === input.spaceId);
  if (!node || !isPooledKind(node.kind)) return { action: "refuse" };

  const existing = input.pools.get(input.spaceId);
  if (existing) {
    if (existing.unitsTotal >= 1) return { action: "use", poolId: existing.id };
    const hasChildren = input.nodes.some((n) => n.parentId === input.spaceId);
    if (hasChildren) return { action: "refuse" };
    return { action: "raise", poolId: existing.id, parentPoolId: existing.parentPoolId, units: 1 };
  }

  // Ancestors without a pool are not constraints: read them as unpooled for SS-1.
  const effective: SpaceNode[] = input.nodes.map((n) =>
    n.id !== input.spaceId && isPooledKind(n.kind) && !input.pools.has(n.id) ? { ...n, kind: "area" } : n,
  );
  const parentSpaceId = nearestPooledAncestorId(effective, input.spaceId);
  return { action: "create", parentPoolId: parentSpaceId ? input.pools.get(parentSpaceId)?.id ?? null : null, units: 1 };
}
