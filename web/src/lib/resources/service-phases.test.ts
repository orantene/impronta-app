import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeReserveSetAdmin } from "../../../test/helpers/reserve-set-fake";
import { reserveServicePhases } from "./service-phases";

const COLOUR = { startsAt: "2026-09-08T15:00:00.000Z", endsAt: "2026-09-08T15:45:00.000Z" };
const RINSE = { startsAt: "2026-09-08T16:15:00.000Z", endsAt: "2026-09-08T16:30:00.000Z" };
const KEY = "appointment:appt-1:reserve";

test("a colour service holds the chair and the wash station as one set", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveServicePhases(admin, {
    tenantId: "t1",
    operationKey: KEY,
    phases: [
      {
        key: "colour",
        holds: [{ talentProfileId: "stylist-1", ...COLOUR }],
        capacity: [{ poolId: "chair-1", units: 1, ...COLOUR }],
      },
      { key: "rinse", capacity: [{ poolId: "wash-1", units: 1, ...RINSE }] },
    ],
  });

  assert.equal(r.ok, true);
  assert.equal(calls.length, 1, "phases are one command, or a competing booking takes the gap between them");
  assert.equal(calls[0]!.args.p_operation_key, KEY);
  assert.deepEqual(calls[0]!.args.p_capacity?.map((c) => c.pool_id), ["chair-1", "wash-1"]);
  assert.deepEqual(calls[0]!.args.p_holds?.map((h) => h.talent_profile_id), ["stylist-1"]);
});

test("a taken wash station refuses the whole appointment, naming the station", async () => {
  const { admin, calls } = fakeReserveSetAdmin({
    reply: () => ({
      data: { ok: false, reason: "sold_out", failed_pool_id: "wash-1", failed_talent_id: null },
      error: null,
    }),
  });
  const r = await reserveServicePhases(admin, {
    tenantId: "t1",
    operationKey: KEY,
    phases: [
      { key: "colour", capacity: [{ poolId: "chair-1", units: 1, ...COLOUR }] },
      { key: "rinse", capacity: [{ poolId: "wash-1", units: 1, ...RINSE }] },
    ],
  });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "sold_out");
  assert.equal(r.failedPoolId, "wash-1");
  assert.equal(calls.length, 1, "the chair is never held on its own, so there is nothing to unwind");
});

test("every phase of one appointment carries the same operation key", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  await reserveServicePhases(admin, {
    tenantId: "t1",
    operationKey: KEY,
    phases: [
      { key: "colour", holds: [{ talentProfileId: "stylist-1", ...COLOUR }] },
      { key: "rinse", holds: [{ talentProfileId: "assistant-1", ...RINSE }] },
    ],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.args.p_holds?.length, 2);
  assert.equal(calls[0]!.args.p_operation_key, KEY);
});
