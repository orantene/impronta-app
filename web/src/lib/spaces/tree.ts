/**
 * The two invariants the capacity engine cannot hold, as pure functions.
 *
 * PURE. No database. That is the point: CI carries no service-role credentials,
 * so anything that needs one gates NOWHERE. (Capacity's 200-concurrent oversell
 * proof, the strongest evidence the engine produced, gates nowhere for exactly
 * that reason.) So the invariant is a FUNCTION over a tree, unit-tested here on
 * every change forever, and a rolled-back probe asserts ONCE that the real
 * schema agrees with the function. The probe checks the model against reality;
 * CI checks every future change against the model. Neither alone is enough.
 *
 * SS-1 NEAREST POOLED ANCESTOR
 *   A pooled space's parent pool is the pool of the nearest ancestor THAT HAS A
 *   POOL, skipping any area or section in between.
 *
 *   Why it cannot live in the engine: `capacity_pools.pool_path` is built from
 *   whatever `parent_pool_id` it is handed, and is correct by construction for
 *   every value that could be passed. There is no wrong-looking row to refuse.
 *   Point one table at its room and its sibling at the venue because a level was
 *   skipped, and the room under-counts that sibling forever, silently.
 *
 * SS-2 MODE EXCLUSIVITY
 *   A group's pool and its members' pools are never both active.
 *
 *   Why it cannot live in the engine: membership is our table. The engine has no
 *   idea which spaces belong to which group, so there is no row it could look at
 *   and refuse. `capacity_subject_kinds` does not cover it either — that maps a
 *   kind to a backing table and has no notion of modes, so registering
 *   `space_group` says the subject id must be a real group row and says nothing
 *   about whether that group should currently be selling.
 */

/** Structural kinds. The word a workspace SHOWS is never one of these. */
export type SpaceKind =
  | "room" | "area" | "section" | "table" | "seat" | "chair" | "booth"
  | "cabana" | "stage" | "court" | "lane" | "desk" | "bed" | "bay" | "unit";

/**
 * Organisational only: they group and they render, they are never allocated
 * against. Everything else can be held, so everything else gets a pool.
 *
 * Expressed as the exclusion list rather than the inclusion list on purpose: a
 * new kind added to the enum should be POOLED by default. Forgetting to add a
 * bookable kind to an inclusion list would silently make it unsellable, and a
 * space nobody can book is a harder bug to see than a pool nobody allocates.
 */
export const UNPOOLED_KINDS: ReadonlySet<SpaceKind> = new Set<SpaceKind>([
  "area",
  "section",
]);

export function isPooledKind(kind: SpaceKind): boolean {
  return !UNPOOLED_KINDS.has(kind);
}

export type SpaceNode = {
  id: string;
  kind: SpaceKind;
  parentId: string | null;
};

/**
 * The id of the nearest ancestor that has a pool, or null when there is none
 * above (the venue root's own pool is the caller's business).
 *
 * Returns null rather than throwing on a broken tree — a missing parent or a
 * cycle — because this runs over data an editor produced and a crash in a
 * validator is worse than a reported violation. `treeIsWellFormed` below is the
 * function that says so out loud.
 */
export function nearestPooledAncestorId(
  nodes: readonly SpaceNode[],
  spaceId: string,
): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([spaceId]);
  let cursor = byId.get(spaceId)?.parentId ?? null;

  while (cursor !== null) {
    if (seen.has(cursor)) return null; // cycle: refuse to loop
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) return null; // dangling parent
    if (isPooledKind(node.kind)) return node.id;
    cursor = node.parentId;
  }
  return null;
}

export type PoolBinding = {
  /** The space this pool is the pool OF. */
  spaceId: string;
  /** The space whose pool this pool's `parent_pool_id` points at, or null. */
  parentPoolSpaceId: string | null;
};

export type Ss1Violation = {
  spaceId: string;
  expectedParentSpaceId: string | null;
  actualParentSpaceId: string | null;
  reason: "wrong_ancestor" | "unpooled_space_has_pool" | "pooled_space_has_no_pool";
};

/**
 * Every way a set of pool bindings can disagree with SS-1.
 *
 * Three distinct failures, because they have different causes and different
 * fixes: a pool parented at the wrong level (the silent under-count), a pool on
 * an area or section (contention for nothing), and a bookable space with no
 * pool at all (unsellable).
 */
export function ss1Violations(
  nodes: readonly SpaceNode[],
  bindings: readonly PoolBinding[],
): Ss1Violation[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const bound = new Map(bindings.map((b) => [b.spaceId, b]));
  const out: Ss1Violation[] = [];

  for (const binding of bindings) {
    const node = byId.get(binding.spaceId);
    if (!node) continue;
    if (!isPooledKind(node.kind)) {
      out.push({
        spaceId: node.id,
        expectedParentSpaceId: null,
        actualParentSpaceId: binding.parentPoolSpaceId,
        reason: "unpooled_space_has_pool",
      });
      continue;
    }
    const expected = nearestPooledAncestorId(nodes, node.id);
    if (expected !== binding.parentPoolSpaceId) {
      out.push({
        spaceId: node.id,
        expectedParentSpaceId: expected,
        actualParentSpaceId: binding.parentPoolSpaceId,
        reason: "wrong_ancestor",
      });
    }
  }

  for (const node of nodes) {
    if (isPooledKind(node.kind) && !bound.has(node.id)) {
      out.push({
        spaceId: node.id,
        expectedParentSpaceId: nearestPooledAncestorId(nodes, node.id),
        actualParentSpaceId: null,
        reason: "pooled_space_has_no_pool",
      });
    }
  }

  return out;
}

export type GroupPoolState = {
  groupId: string;
  sellMode: "band" | "assigned";
  /** Is the group's own pool active right now? */
  groupPoolActive: boolean;
  /** The member spaces whose own pool is active right now. */
  activeMemberSpaceIds: readonly string[];
};

export type Ss2Violation = {
  groupId: string;
  reason: "both_active" | "band_without_pool" | "assigned_with_group_pool";
  activeMemberSpaceIds: readonly string[];
};

/**
 * Every way a group's pools can disagree with SS-2.
 *
 * `both_active` is the one that double-sells a table and the reason the
 * invariant exists. The other two are a mode that cannot sell anything (band
 * with no pool) and a mode selling twice over (assigned while the group pool is
 * still live), which is what a half-finished band-to-assigned migration looks
 * like from the outside.
 */
export function ss2Violations(groups: readonly GroupPoolState[]): Ss2Violation[] {
  const out: Ss2Violation[] = [];
  for (const g of groups) {
    const membersActive = g.activeMemberSpaceIds.length > 0;
    if (g.groupPoolActive && membersActive) {
      out.push({
        groupId: g.groupId,
        reason: "both_active",
        activeMemberSpaceIds: g.activeMemberSpaceIds,
      });
      continue;
    }
    if (g.sellMode === "band" && !g.groupPoolActive) {
      out.push({ groupId: g.groupId, reason: "band_without_pool", activeMemberSpaceIds: [] });
      continue;
    }
    if (g.sellMode === "assigned" && g.groupPoolActive) {
      out.push({
        groupId: g.groupId,
        reason: "assigned_with_group_pool",
        activeMemberSpaceIds: g.activeMemberSpaceIds,
      });
    }
  }
  return out;
}

/** A tree with a dangling parent or a cycle, which every other rule assumes away. */
export function treeIsWellFormed(nodes: readonly SpaceNode[]): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const start of nodes) {
    const seen = new Set<string>([start.id]);
    let cursor = start.parentId;
    while (cursor !== null) {
      if (seen.has(cursor)) return false;
      const node = byId.get(cursor);
      if (!node) return false;
      seen.add(cursor);
      cursor = node.parentId;
    }
  }
  return true;
}
