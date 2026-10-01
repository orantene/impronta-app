import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSlotTakenState, endForStart, sentCopyKeys } from "./reserve-slot-taken";

const ctx = {
  reservation: {
    v: 1,
    offering_id: "11111111-1111-4111-8111-111111111111",
    starts_at: "2026-10-05T16:00:00.000Z",
    ends_at: "2026-10-05T17:00:00.000Z",
    timezone: "America/Mexico_City",
    duration_minutes: 60,
    mode: "request",
  },
};

test("taken slot returns next free times, never the lost one, max 3", async () => {
  const s = await buildSlotTakenState(
    {
      talentIdForOffering: async () => "t1",
      nextFreeTimes: async () => ["2026-10-05T16:00:00.000Z", "a", "b", "c", "d"],
    },
    ctx,
    undefined,
  );
  assert.equal(s.kind, "slot_taken");
  assert.deepEqual(s.nextFreeTimes, ["a", "b", "c"]);
  assert.equal(s.timezone, "America/Mexico_City");
});

test("lookup failure still reports slot_taken with empty times", async () => {
  const s = await buildSlotTakenState(
    { talentIdForOffering: async () => { throw new Error("x"); }, nextFreeTimes: async () => ["a"] },
    ctx,
    "gone",
  );
  assert.deepEqual(s.nextFreeTimes, []);
  assert.equal(s.message, "gone");
});

test("chip end is start plus duration", () => {
  assert.equal(endForStart("2026-10-05T16:00:00.000Z", 90), "2026-10-05T17:30:00.000Z");
});

test("solo vs agency copy keys", () => {
  assert.equal(sentCopyKeys("Jor").solo, true);
  assert.match(sentCopyKeys("Jor").body, /soloSubmittedBody/);
  assert.equal(sentCopyKeys(null).solo, false);
  assert.match(sentCopyKeys("  ").body, /\.submittedBody/);
});
