/**
 * The band-to-assigned plan. The ordering IS the correctness argument, so the
 * tests are about order and refusal, not about counts.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { planModeMigration, type LiveBandAllocation } from "./mode-migration";
import type { SpaceNode } from "./tree";

const NODES: SpaceNode[] = [
  { id: "room", kind: "room", parentId: null },
  { id: "t1", kind: "table", parentId: "room" },
  { id: "t2", kind: "table", parentId: "room" },
];
const MEMBERS = ["t1", "t2"];

function alloc(over: Partial<LiveBandAllocation> & { allocationId: string }): LiveBandAllocation {
  return {
    startsAt: "2026-09-10T20:00:00Z",
    endsAt: "2026-09-10T22:00:00Z",
    units: 1,
    ...over,
  };
}

test("an empty band migrates trivially and is safe", () => {
  const plan = planModeMigration({ memberSpaceIds: MEMBERS, nodes: NODES, live: [] });
  assert.deepEqual(plan.createPoolsFor, ["t1", "t2"]);
  assert.deepEqual(plan.reseat, []);
  assert.equal(plan.safeToRun, true);
});

test("two overlapping allocations get DIFFERENT tables", () => {
  // The bug this pins: planning each allocation independently would promise
  // both of them t1, and the second reserve would fail mid-migration with the
  // band pool already partly drained.
  const plan = planModeMigration({
    memberSpaceIds: MEMBERS,
    nodes: NODES,
    live: [alloc({ allocationId: "a" }), alloc({ allocationId: "b" })],
  });
  assert.equal(plan.safeToRun, true);
  const targets = plan.reseat.map((r) => r.toSpaceId).sort();
  assert.deepEqual(targets, ["t1", "t2"]);
});

test("non-overlapping allocations may REUSE the same table", () => {
  const plan = planModeMigration({
    memberSpaceIds: MEMBERS,
    nodes: NODES,
    live: [
      alloc({ allocationId: "early", startsAt: "2026-09-10T18:00:00Z", endsAt: "2026-09-10T20:00:00Z" }),
      alloc({ allocationId: "late", startsAt: "2026-09-10T20:00:00Z", endsAt: "2026-09-10T22:00:00Z" }),
    ],
  });
  assert.equal(plan.safeToRun, true);
  // Half-open: 20:00 to 20:00 is not a clash, so one table serves both.
  assert.equal(new Set(plan.reseat.map((r) => r.toSpaceId)).size, 1);
});

test("REFUSES to run when even one allocation cannot be placed", () => {
  // Three overlapping parties, two tables. Running would move two guests and
  // strand the third mid-service with the band pool partly drained.
  const plan = planModeMigration({
    memberSpaceIds: MEMBERS,
    nodes: NODES,
    live: [alloc({ allocationId: "a" }), alloc({ allocationId: "b" }), alloc({ allocationId: "c" })],
  });
  assert.equal(plan.safeToRun, false);
  assert.equal(plan.unplaceable.length, 1);
  assert.equal(plan.unplaceable[0]?.reason, "no_free_member");
});

test("a party the host already seated keeps its table", () => {
  const plan = planModeMigration({
    memberSpaceIds: MEMBERS,
    nodes: NODES,
    live: [alloc({ allocationId: "a", assignedSpaceId: "t2" })],
  });
  assert.equal(plan.reseat[0]?.toSpaceId, "t2");
});

test("an already-seated party does not displace another that overlaps it", () => {
  const plan = planModeMigration({
    memberSpaceIds: MEMBERS,
    nodes: NODES,
    live: [
      alloc({ allocationId: "seated", assignedSpaceId: "t1" }),
      alloc({ allocationId: "other" }),
    ],
  });
  assert.equal(plan.safeToRun, true);
  const seated = plan.reseat.find((r) => r.allocationId === "seated");
  const other = plan.reseat.find((r) => r.allocationId === "other");
  assert.equal(seated?.toSpaceId, "t1");
  assert.notEqual(other?.toSpaceId, "t1");
});

test("the longest booking is placed first, so a short one cannot strand it", () => {
  // Placed shortest-first, the two short bookings would take both tables and
  // the long one would have nowhere to go, making a migratable venue refuse.
  const plan = planModeMigration({
    memberSpaceIds: MEMBERS,
    nodes: NODES,
    live: [
      alloc({ allocationId: "short1", startsAt: "2026-09-10T18:00:00Z", endsAt: "2026-09-10T19:00:00Z" }),
      alloc({ allocationId: "short2", startsAt: "2026-09-10T21:00:00Z", endsAt: "2026-09-10T22:00:00Z" }),
      alloc({ allocationId: "long", startsAt: "2026-09-10T18:00:00Z", endsAt: "2026-09-10T22:00:00Z" }),
    ],
  });
  assert.equal(plan.reseat[0]?.allocationId, "long");
  assert.equal(plan.safeToRun, true);
});

test("every reseat carries the window and units it must reserve with", () => {
  // The runner reserves BEFORE releasing, so it needs the original's window and
  // units on the plan rather than re-reading them between the two steps.
  const plan = planModeMigration({
    memberSpaceIds: MEMBERS,
    nodes: NODES,
    live: [alloc({ allocationId: "a", units: 2 })],
  });
  assert.deepEqual(plan.reseat[0], {
    allocationId: "a",
    toSpaceId: "t1",
    startsAt: "2026-09-10T20:00:00Z",
    endsAt: "2026-09-10T22:00:00Z",
    units: 2,
  });
});

// ── runModeMigration: the order is the whole correctness argument ───────────

import { runModeMigration, type ModeMigrationPlan } from "./mode-migration";

function recordingRpc(fail?: { at: "reserve" | "commit" | "release"; on: string }) {
  const calls: string[] = [];
  let n = 0;
  return {
    calls,
    rpc: {
      reserve: async (spaceId: string) => {
        calls.push(`reserve:${spaceId}`);
        if (fail?.at === "reserve" && spaceId === fail.on) return { ok: false, reason: "sold_out" };
        n += 1;
        return { ok: true, allocationId: `new-${n}` };
      },
      commit: async (id: string) => {
        calls.push(`commit:${id}`);
        if (fail?.at === "commit") return { ok: false, reason: "expired" };
        return { ok: true };
      },
      release: async (id: string) => {
        calls.push(`release:${id}`);
        if (fail?.at === "release") return { ok: false, reason: "not_found" };
        return { ok: true };
      },
      deactivateGroupPool: async () => {
        calls.push("deactivate");
        return true;
      },
    },
  };
}

const PLAN: ModeMigrationPlan = {
  createPoolsFor: ["t1"],
  reseat: [
    {
      allocationId: "band-1",
      toSpaceId: "t1",
      startsAt: "2026-09-10T20:00:00Z",
      endsAt: "2026-09-10T22:00:00Z",
      units: 1,
    },
  ],
  unplaceable: [],
  safeToRun: true,
};

test("RESERVE comes before RELEASE, never the reverse", () => {
  // The single most important assertion in this file. Release-then-reserve
  // leaves the guest holding nothing while a walk-in can take their table.
  const { calls, rpc } = recordingRpc();
  return runModeMigration(PLAN, rpc).then((run) => {
    assert.equal(run.moved, 1);
    assert.deepEqual(calls, ["reserve:t1", "commit:new-1", "release:band-1", "deactivate"]);
    assert.ok(calls.indexOf("reserve:t1") < calls.indexOf("release:band-1"));
  });
});

test("a failed reserve stops the run and NEVER releases the guest's allocation", () => {
  const { calls, rpc } = recordingRpc({ at: "reserve", on: "t1" });
  return runModeMigration(PLAN, rpc).then((run) => {
    assert.equal(run.moved, 0);
    assert.equal(run.stoppedAt?.step, "reserve");
    assert.equal(calls.includes("release:band-1"), false);
    assert.equal(run.groupPoolDeactivated, false);
  });
});

test("a failed commit also leaves the band allocation held", () => {
  const { calls, rpc } = recordingRpc({ at: "commit", on: "" });
  return runModeMigration(PLAN, rpc).then((run) => {
    assert.equal(run.stoppedAt?.step, "commit");
    assert.equal(calls.includes("release:band-1"), false);
  });
});

test("a failed release is reported, not swallowed", () => {
  // The guest now holds both, which double-counts against the band. Safe
  // direction — nobody is unseated — but the band reads fuller than it is.
  const { rpc } = recordingRpc({ at: "release", on: "" });
  return runModeMigration(PLAN, rpc).then((run) => {
    assert.equal(run.stoppedAt?.step, "release");
    assert.equal(run.groupPoolDeactivated, false);
  });
});

test("an unsafe plan does nothing at all", () => {
  const { calls, rpc } = recordingRpc();
  const unsafe: ModeMigrationPlan = {
    ...PLAN,
    unplaceable: [{ allocationId: "band-9", reason: "no_free_member" }],
    safeToRun: false,
  };
  return runModeMigration(unsafe, rpc).then((run) => {
    assert.equal(run.moved, 0);
    assert.deepEqual(calls, []);
    assert.equal(run.stoppedAt?.reason, "plan_not_safe");
  });
});

test("the band pool is deactivated only after every guest has moved", () => {
  const { calls, rpc } = recordingRpc();
  return runModeMigration(PLAN, rpc).then(() => {
    assert.equal(calls[calls.length - 1], "deactivate");
  });
});
