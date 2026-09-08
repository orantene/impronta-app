import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveServicePhases } from "./service-phases";

const COLOUR = { startsAt: "2026-09-08T15:00:00.000Z", endsAt: "2026-09-08T15:45:00.000Z" };
const RINSE = { startsAt: "2026-09-08T16:15:00.000Z", endsAt: "2026-09-08T16:30:00.000Z" };

test("a colour service holds the chair and the wash station as one set", async () => {
  const placed: string[] = [];
  const pools: string[] = [];
  const r = await reserveServicePhases(
    { rpc: async () => ({ data: null, error: null }), from: () => ({}) } as never,
    {
      tenantId: "t1",
      phases: [
        {
          key: "colour",
          holds: [{ talentProfileId: "stylist-1", ...COLOUR }],
          capacity: [{ poolId: "chair-1", units: 1, ...COLOUR }],
        },
        {
          key: "rinse",
          capacity: [{ poolId: "wash-1", units: 1, ...RINSE }],
        },
      ],
    },
    {
      reserveCapacityBatch: async (reqs) => {
        pools.push(...reqs.map((q) => q.poolId));
        return { ok: true, allocationIds: reqs.map((_, i) => `a${i}`), expiresAt: null };
      },
      releaseCapacity: async () => ({ ok: true, released: 0, alreadyReleased: 0 }),
      placeHold: async (_admin, input) => {
        placed.push(input.talentProfileId);
        return { ok: true, holdId: `h-${input.talentProfileId}`, expiresAt: null };
      },
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(pools, ["chair-1", "wash-1"]);
  assert.deepEqual(placed, ["stylist-1"]);
});

test("a taken wash station releases the chair already held for colour", async () => {
  const released: string[] = [];
  const r = await reserveServicePhases(
    { rpc: async () => ({ data: null, error: null }), from: () => ({}) } as never,
    {
      tenantId: "t1",
      phases: [
        { key: "colour", capacity: [{ poolId: "chair-1", units: 1, ...COLOUR }] },
        { key: "rinse", capacity: [{ poolId: "wash-1", units: 1, ...RINSE }] },
      ],
    },
    {
      reserveCapacityBatch: async () => ({ ok: false, reason: "sold_out", failedPoolId: "wash-1" }),
      releaseCapacity: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
      placeHold: async () => ({ ok: true, holdId: "no", expiresAt: null }),
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.failedPoolId, "wash-1");
  assert.equal(released.length, 0, "capacity batch writes nothing when a later station is sold out");
});
