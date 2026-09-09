import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fakeReserveSetAdmin,
  grantedReply,
  type ReserveSetRpcArgs,
} from "../../../test/helpers/reserve-set-fake";
import { expandedHoldWindow, reserveResourceSet, spaceCapacityPool } from "./reserve-set";

const START = "2026-09-08T15:00:00.000Z";
const END = "2026-09-08T16:00:00.000Z";
const KEY = "order:ord-1:reserve";

/** The set the salon sells: four people, four stations, one command. */
function bridalSet() {
  return {
    tenantId: "t1",
    operationKey: KEY,
    actorUserId: "u1",
    ttlSeconds: 900,
    holds: [1, 2, 3, 4].map((n) => ({
      talentProfileId: `tech-${n}`,
      startsAt: START,
      endsAt: END,
      title: "Bridal",
    })),
    capacity: [1, 2, 3, 4].map((n) => ({ poolId: `station-${n}`, units: 1, startsAt: START, endsAt: END })),
  };
}

test("travel buffers extend the hold window, not a second booking", () => {
  const w = expandedHoldWindow({
    talentProfileId: "tech-1",
    startsAt: START,
    endsAt: END,
    bufferBeforeSeconds: 30 * 60,
    bufferAfterSeconds: 15 * 60,
  });
  assert.ok(!("ok" in w));
  if ("ok" in w) return;
  assert.equal(w.startsAt, "2026-09-08T14:30:00.000Z");
  assert.equal(w.endsAt, "2026-09-08T16:15:00.000Z");
});

test("the whole set goes to the engine as ONE call, carrying the operation key", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveResourceSet(admin, bridalSet());

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(calls.length, 1, "a set is one command, not one call per resource");
  assert.equal(calls[0]!.fn, "reserve_resource_set_v2");
  assert.equal(calls[0]!.args.p_operation_key, KEY);
  assert.equal(calls[0]!.args.p_capacity?.length, 4);
  assert.equal(calls[0]!.args.p_holds?.length, 4);
  assert.equal(r.holdIds.length, 4);
  assert.equal(r.allocationIds.length, 4);
  assert.equal(r.already, false);
});

test("buffers travel as buffers, so the engine derives the same window", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  await reserveResourceSet(admin, {
    tenantId: "t1",
    operationKey: KEY,
    holds: [
      {
        talentProfileId: "tech-1",
        startsAt: START,
        endsAt: END,
        bufferBeforeSeconds: 1800,
        bufferAfterSeconds: 900,
      },
    ],
  });
  assert.deepEqual(calls[0]!.args.p_holds?.[0], {
    talent_profile_id: "tech-1",
    starts_at: START,
    ends_at: END,
    title: null,
    inquiry_id: null,
    buffer_before_seconds: 1800,
    buffer_after_seconds: 900,
  });
});

test("a set with no operation key is refused before anything is asked of the engine", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveResourceSet(admin, { ...bridalSet(), operationKey: "   " });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "bad_input");
  assert.equal(calls.length, 0, "an unnameable command cannot be replayed, so it must not run");
});

test("an empty set is refused without a round trip", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveResourceSet(admin, { tenantId: "t1", operationKey: KEY });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "empty_batch");
  assert.equal(calls.length, 0);
});

// ── the defect this module was rewritten to close ────────────────────────────

test("an RPC transport error writes NOTHING and does not try a second way", async () => {
  const { admin, calls, tables } = fakeReserveSetAdmin({
    reply: () => ({ data: null, error: { message: "connection reset" } }),
  });
  const r = await reserveResourceSet(admin, bridalSet());

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "unavailable");
  assert.equal(calls.length, 1, "a lost answer may mean the reservation COMMITTED; asking again is how it double-allocated");
  assert.deepEqual(
    tables.filter((t) => t !== "capacity_pools"),
    [],
    "the only table this module may touch is the pool read that names a refusal",
  );
});

test("reason 'unavailable' is a refusal, not a licence to reserve by hand", async () => {
  const { admin, calls, tables } = fakeReserveSetAdmin({
    reply: () => ({ data: { ok: false, reason: "unavailable" }, error: null }),
  });
  const r = await reserveResourceSet(admin, bridalSet());

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "unavailable");
  assert.equal(calls.length, 1);
  assert.deepEqual(tables.filter((t) => t !== "capacity_pools"), []);
});

test("a replay of the same key surfaces `already` with the first answer's ids", async () => {
  const { admin } = fakeReserveSetAdmin({
    reply: (call) => ({
      data: grantedReply(call.args, {
        already: true,
        hold_ids: ["hold-first"],
        allocation_ids: ["alloc-first"],
        expires_at: "2026-09-08T15:15:00.000Z",
      }),
      error: null,
    }),
  });
  const r = await reserveResourceSet(admin, bridalSet());

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.already, true);
  assert.deepEqual(r.holdIds, ["hold-first"]);
  assert.deepEqual(r.allocationIds, ["alloc-first"]);
  assert.equal(r.expiresAt, "2026-09-08T15:15:00.000Z");
});

test("a deadlock is retried, and at most three times", async () => {
  const { admin, calls } = fakeReserveSetAdmin({
    reply: () => ({ data: { ok: false, reason: "deadlock" }, error: null }),
  });
  const r = await reserveResourceSet(admin, bridalSet());

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "deadlock");
  assert.equal(calls.length, 3, "the RPC is atomic, so retrying is safe — but not forever");
});

test("a deadlock that clears on the second attempt still reserves once", async () => {
  const { admin, calls } = fakeReserveSetAdmin({
    reply: (call, attempt) =>
      attempt === 1
        ? { data: { ok: false, reason: "deadlock" }, error: null }
        : { data: grantedReply(call.args), error: null },
  });
  const r = await reserveResourceSet(admin, bridalSet());

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(calls.length, 2);
  assert.deepEqual(new Set(calls.map((c) => c.args.p_operation_key)), new Set([KEY]));
});

test("every refusal reason the engine can give is passed through, with what blocked it", async () => {
  const cases: Array<[string, string | null, string | null]> = [
    ["slot_taken", null, "tech-b"],
    ["sold_out", "station-1", null],
    ["ancestor_full", "station-1", null],
    ["pool_not_found", "station-9", null],
    ["wrong_tenant", "station-9", null],
    ["invalid", null, "tech-b"],
    ["in_flight", null, null],
  ];
  for (const [reason, pool, talent] of cases) {
    const { admin } = fakeReserveSetAdmin({
      reply: () => ({
        data: { ok: false, reason, failed_pool_id: pool, failed_talent_id: talent },
        error: null,
      }),
    });
    const r = await reserveResourceSet(admin, bridalSet());
    assert.equal(r.ok, false, reason);
    if (r.ok) return;
    assert.equal(r.reason, reason);
    assert.equal(r.failedPoolId, pool);
    assert.equal(r.failedTalentId, talent);
    assert.ok(r.error.length > 0, `${reason} must carry a sentence a surface can show`);
  }
});

test("sold out and slot taken read as unavailability, not as an outage", async () => {
  for (const reason of ["sold_out", "slot_taken"]) {
    const { admin } = fakeReserveSetAdmin({
      reply: () => ({ data: { ok: false, reason }, error: null }),
    });
    const r = await reserveResourceSet(admin, bridalSet());
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "That resource is not free.");
  }
});

test("a hold window that cannot exist is refused before the engine is asked", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveResourceSet(admin, {
    tenantId: "t1",
    operationKey: KEY,
    holds: [{ talentProfileId: "tech-1", startsAt: END, endsAt: START }],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "invalid");
  assert.equal(r.error, "End must be after start.");
  assert.equal(r.failedTalentId, "tech-1");
  assert.equal(calls.length, 0);
});

test("a pool from another workspace writes nothing", async () => {
  const { admin, calls } = fakeReserveSetAdmin({
    pools: [{ id: "kitchen-other", tenant_id: "t-other" }],
  });
  const r = await reserveResourceSet(admin, {
    tenantId: "t1",
    operationKey: KEY,
    capacity: [{ poolId: "kitchen-other", units: 1, startsAt: START, endsAt: END }],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "wrong_tenant");
  assert.equal(r.failedPoolId, "kitchen-other");
  assert.equal(calls.length, 0);
});

test("an unknown pool id writes nothing", async () => {
  const { admin, calls } = fakeReserveSetAdmin({ pools: [] });
  const r = await reserveResourceSet(admin, {
    tenantId: "t1",
    operationKey: KEY,
    capacity: [{ poolId: "missing-pool", units: 1, startsAt: START, endsAt: END }],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "pool_not_found");
  assert.equal(r.failedPoolId, "missing-pool");
  assert.equal(calls.length, 0);
});

test("an admin with no rpc refuses rather than reaching for another writer", async () => {
  const readOnly = {
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: [{ id: "station-1", tenant_id: "t1" }], error: null }).then(resolve),
      };
      return api;
    },
  } as unknown as Parameters<typeof reserveResourceSet>[0];
  const r = await reserveResourceSet(readOnly, {
    tenantId: "t1",
    operationKey: KEY,
    capacity: [{ poolId: "station-1", units: 1, startsAt: START, endsAt: END }],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "unavailable");
});

test("the ttl and the actor reach the engine rather than being applied locally", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  await reserveResourceSet(admin, { ...bridalSet(), ttlSeconds: 900, actorUserId: "u1" });
  const args: ReserveSetRpcArgs = calls[0]!.args;
  assert.equal(args.p_ttl_seconds, 900);
  assert.equal(args.p_actor_id, "u1");
  assert.equal(args.p_tenant_id, "t1");
});

test("spaceCapacityPool reads a space subject, never a person", async () => {
  const seen: Array<[string, unknown]> = [];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "capacity_pools");
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          seen.push([k, v]);
          return api;
        },
        maybeSingle: async () => ({ data: { id: "pool-station", units_total: 3 }, error: null }),
      };
      return api;
    },
  };
  const r = await spaceCapacityPool(admin as never, { tenantId: "t1", spaceId: "space-wash" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.poolId, "pool-station");
  assert.equal(r.unitsTotal, 3);
  assert.deepEqual(seen, [
    ["tenant_id", "t1"],
    ["subject_kind", "space"],
    ["subject_id", "space-wash"],
    ["pool_key", "default"],
  ]);
});
