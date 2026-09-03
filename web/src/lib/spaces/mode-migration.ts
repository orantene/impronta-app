/**
 * Moving a venue from band mode to assigned mode.
 *
 * WHAT CHANGES. In band mode the GROUP carries a parentless pool and its member
 * tables carry none: "a four-top at 8pm" sells a band. In assigned mode the
 * TABLES carry pools parented to their room, and the group becomes a pure
 * selection. SS-2 says these are never both live, so the change is a migration
 * and not a setting.
 *
 * WHY IT IS NOT A RE-PARENT. The engine refuses to re-parent a pool that holds
 * live allocations, and rightly: every existing allocation would silently start
 * charging a different chain. So the shape is create, drain, deactivate.
 *
 * THE ORDER IS THE SAFETY PROPERTY.
 *
 *   1. create the table pools, parented to the room
 *   2. for each live group allocation: reserve the table, then COMMIT it
 *   3. ONLY THEN release the group allocation
 *   4. when the group pool is drained, set is_active = false. Never delete.
 *
 * Reserve the replacement BEFORE releasing the original, never the reverse.
 * Release-then-reserve opens a window in which the guest holds nothing and a
 * walk-in can take their table. If step 2 fails for one guest, stop: they still
 * hold their band allocation, which is the safe failure. Half-migrated is a
 * state the venue can keep trading in; half-released is not.
 *
 * WHY THE PLAN IS PURE AND SEPARATE FROM THE RUN. The ordering above is the
 * whole correctness argument, and it is exactly what a test can check without a
 * database. `planModeMigration` decides; `runModeMigration` performs. CI gates
 * the decision on every change; the probe proves the engine agrees once.
 */

import type { SpaceNode } from "./tree";

export type LiveBandAllocation = {
  allocationId: string;
  startsAt: string;
  endsAt: string;
  units: number;
  /** Where the host has already said this party is sitting, if anywhere. */
  assignedSpaceId?: string | null;
};

export type ModeMigrationPlan = {
  /** Tables that need a pool creating, parents before children. */
  createPoolsFor: string[];
  /** One re-seat per live allocation, in the order they must be performed. */
  reseat: Array<{
    allocationId: string;
    toSpaceId: string;
    startsAt: string;
    endsAt: string;
    units: number;
  }>;
  /** Allocations with nowhere to go: the migration must not start. */
  unplaceable: Array<{ allocationId: string; reason: "no_free_member" }>;
  /** True only when every live allocation has a destination. */
  safeToRun: boolean;
};

export type PlanInput = {
  /** The group's member spaces, in preference order. */
  memberSpaceIds: readonly string[];
  /** The tree, so each table's pool parent can be resolved (SS-1). */
  nodes: readonly SpaceNode[];
  /** Every allocation currently live against the band pool. */
  live: readonly LiveBandAllocation[];
};

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Decide the whole migration before performing any of it.
 *
 * REFUSING TO START IS A FEATURE. If even one live allocation has no free
 * member table over its window, the plan is not safe: running it would move
 * some guests and strand others mid-service, with the band pool partly drained
 * and no way to tell from the outside which state the venue is in. Better to
 * report which allocation cannot be placed and let a human decide.
 */
export function planModeMigration(input: PlanInput): ModeMigrationPlan {
  const reseat: ModeMigrationPlan["reseat"] = [];
  const unplaceable: ModeMigrationPlan["unplaceable"] = [];

  // What each table is committed to as the plan is built, so two allocations in
  // the same window cannot both be promised the same table.
  const taken = new Map<string, Array<{ startsAt: string; endsAt: string }>>();

  const isFree = (spaceId: string, startsAt: string, endsAt: string): boolean =>
    !(taken.get(spaceId) ?? []).some((w) => overlaps(startsAt, endsAt, w.startsAt, w.endsAt));

  // ALREADY-SEATED PARTIES FIRST, then longest window.
  //
  // Seating is a hard constraint and duration is only a preference: you cannot
  // move a guest who is physically at a table mid-meal, whereas an unseated
  // booking can go anywhere that is free. Sorting by duration alone lets an
  // unseated party take the table someone is already sitting at, and the plan
  // then quietly relocates a real person to satisfy a heuristic. A test caught
  // exactly that, and the code was what was wrong.
  //
  // Longest-first survives as the tiebreak among unseated bookings, because a
  // long booking has the fewest places it can go and placing it while the floor
  // is empty avoids stranding it after short ones have fragmented the night.
  const durationOf = (a: LiveBandAllocation): number =>
    Date.parse(a.endsAt) - Date.parse(a.startsAt);
  const seatedRank = (a: LiveBandAllocation): number =>
    a.assignedSpaceId && input.memberSpaceIds.includes(a.assignedSpaceId) ? 0 : 1;

  const ordered = [...input.live].sort(
    (a, b) =>
      seatedRank(a) - seatedRank(b) ||
      durationOf(b) - durationOf(a) ||
      a.allocationId.localeCompare(b.allocationId),
  );

  for (const alloc of ordered) {
    // A party the host already seated keeps its table, if it is still free.
    const preferred =
      alloc.assignedSpaceId && input.memberSpaceIds.includes(alloc.assignedSpaceId)
        ? [alloc.assignedSpaceId]
        : [];
    const candidates = [
      ...preferred,
      ...input.memberSpaceIds.filter((id) => id !== alloc.assignedSpaceId),
    ];

    const target = candidates.find((id) => isFree(id, alloc.startsAt, alloc.endsAt));
    if (!target) {
      unplaceable.push({ allocationId: alloc.allocationId, reason: "no_free_member" });
      continue;
    }
    taken.set(target, [
      ...(taken.get(target) ?? []),
      { startsAt: alloc.startsAt, endsAt: alloc.endsAt },
    ]);
    reseat.push({
      allocationId: alloc.allocationId,
      toSpaceId: target,
      startsAt: alloc.startsAt,
      endsAt: alloc.endsAt,
      units: alloc.units,
    });
  }

  return {
    createPoolsFor: [...input.memberSpaceIds],
    reseat,
    unplaceable,
    safeToRun: unplaceable.length === 0,
  };
}

/**
 * Perform a plan. Reserve before release, and stop at the first failure.
 *
 * Every step is deliberately sequential rather than batched. A batch reserve is
 * all-or-nothing across pools, which sounds safer and is wrong here: if the
 * batch fails halfway there is no per-guest answer to give, and if it succeeds
 * we still have to release the band allocations one at a time anyway. Doing it
 * per guest means a failure names the guest it failed for.
 */
export type ModeMigrationRun = {
  moved: number;
  /** The allocation that stopped the run, if one did. Everything before it is done. */
  stoppedAt: { allocationId: string; step: "reserve" | "commit" | "release"; reason: string } | null;
  groupPoolDeactivated: boolean;
};

type CapacityRpc = {
  reserve: (
    spaceId: string,
    startsAt: string,
    endsAt: string,
    units: number,
  ) => Promise<{ ok: boolean; allocationId?: string; reason?: string }>;
  commit: (allocationId: string) => Promise<{ ok: boolean; reason?: string }>;
  release: (allocationId: string) => Promise<{ ok: boolean; reason?: string }>;
  deactivateGroupPool: () => Promise<boolean>;
};

export async function runModeMigration(
  plan: ModeMigrationPlan,
  rpc: CapacityRpc,
): Promise<ModeMigrationRun> {
  // Refusing to start is part of the design: a partly-drained band pool with
  // some guests moved and others stranded is a state nobody can read from
  // outside. See `planModeMigration`.
  if (!plan.safeToRun) {
    return {
      moved: 0,
      stoppedAt: {
        allocationId: plan.unplaceable[0]?.allocationId ?? "unknown",
        step: "reserve",
        reason: "plan_not_safe",
      },
      groupPoolDeactivated: false,
    };
  }

  let moved = 0;
  for (const step of plan.reseat) {
    // 1. RESERVE the replacement. The guest still holds their band allocation.
    const reserved = await rpc.reserve(step.toSpaceId, step.startsAt, step.endsAt, step.units);
    if (!reserved.ok || !reserved.allocationId) {
      return {
        moved,
        stoppedAt: {
          allocationId: step.allocationId,
          step: "reserve",
          reason: reserved.reason ?? "unknown",
        },
        groupPoolDeactivated: false,
      };
    }

    // 2. COMMIT it, so it is no longer a hold that a reaper could expire out
    //    from under a guest who has already been told where they are sitting.
    const committed = await rpc.commit(reserved.allocationId);
    if (!committed.ok) {
      // The new hold will lapse on its own TTL; the guest keeps their band
      // allocation. Releasing it here would be the reverse of the safe order.
      return {
        moved,
        stoppedAt: {
          allocationId: step.allocationId,
          step: "commit",
          reason: committed.reason ?? "unknown",
        },
        groupPoolDeactivated: false,
      };
    }

    // 3. ONLY NOW release the band allocation.
    const released = await rpc.release(step.allocationId);
    if (!released.ok) {
      // The guest now holds BOTH, which double-counts against the band. That is
      // the safe direction to fail in — nobody is unseated — but it must be
      // reported rather than swallowed, because the band pool will read fuller
      // than it is until someone clears it.
      return {
        moved,
        stoppedAt: {
          allocationId: step.allocationId,
          step: "release",
          reason: released.reason ?? "unknown",
        },
        groupPoolDeactivated: false,
      };
    }
    moved += 1;
  }

  // 4. The band pool is drained. Deactivate, never delete: its allocations are
  //    the record of what was sold against that band.
  const deactivated = await rpc.deactivateGroupPool();
  return { moved, stoppedAt: null, groupPoolDeactivated: deactivated };
}
