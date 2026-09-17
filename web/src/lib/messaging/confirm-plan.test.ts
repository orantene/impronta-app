import assert from "node:assert/strict";
import { test } from "node:test";

import { buildConfirmPlan, conflictDate, runConfirmChecks, type ConfirmReaders } from "./confirm-plan";

const T0 = "2026-09-20T15:00:00.000Z";
const T1 = "2026-09-20T16:00:00.000Z";

test("buildConfirmPlan: people get a calendar check, pools a capacity check, menu nothing", () => {
  const plan = buildConfirmPlan("draft", [
    { id: "l1", label: "Haircut with Ana", talentProfileId: "ana", startsAt: T0, endsAt: T1 },
    { id: "l2", label: "Chair 3", poolId: "pool-chair", units: 1, startsAt: T0, endsAt: T1 },
    { id: "l3", label: "Tacos al pastor", units: 3 },
    { id: "l4", label: "VIP seats", poolId: "pool-vip", units: 2, startsAt: T0, endsAt: T1 },
  ]);
  assert.equal(plan.source, "draft");
  assert.deepEqual(
    plan.checks.map((c) => [c.kind, c.lineId]),
    [
      ["person", "l1"],
      ["capacity", "l2"],
      ["capacity", "l4"],
    ],
  );
  assert.deepEqual(plan.skipped, [{ lineId: "l3", label: "Tacos al pastor", why: "menu" }]);
  const vip = plan.checks[2];
  assert.equal(vip.kind === "capacity" && vip.units, 2);
});

test("buildConfirmPlan: an undated person is skipped as no_date, never checked against nothing", () => {
  const plan = buildConfirmPlan("offer", [{ id: "l1", label: "DJ set", talentProfileId: "dj" }]);
  assert.equal(plan.checks.length, 0);
  assert.deepEqual(plan.skipped, [{ lineId: "l1", label: "DJ set", why: "no_date" }]);
});

test("buildConfirmPlan: the same talent on the same window is one calendar question", () => {
  const plan = buildConfirmPlan("offer", [
    { id: "a", label: "Set 1", talentProfileId: "dj", startsAt: T0, endsAt: T1 },
    { id: "b", label: "Set 2", talentProfileId: "dj", startsAt: T0, endsAt: T1 },
  ]);
  assert.equal(plan.checks.length, 1);
});

test("buildConfirmPlan: a line the draft already holds is skipped, not counted against itself", () => {
  const plan = buildConfirmPlan("draft", [
    { id: "a", label: "Seat", poolId: "p", units: 1, startsAt: T0, endsAt: T1, alreadyHeld: true },
  ]);
  assert.equal(plan.checks.length, 0);
  assert.equal(plan.skipped[0]?.why, "already_held");
});

test("buildConfirmPlan: a bad window (end before start) counts as undated", () => {
  const plan = buildConfirmPlan("draft", [{ id: "a", label: "X", talentProfileId: "t", startsAt: T1, endsAt: T0 }]);
  assert.equal(plan.checks.length, 0);
  assert.equal(plan.skipped[0]?.why, "no_date");
});

function readers(overrides: Partial<ConfirmReaders>): ConfirmReaders {
  return {
    busy: async () => [],
    remaining: async () => 99,
    ...overrides,
  };
}

test("runConfirmChecks: a free calendar and enough units is no conflict", async () => {
  const plan = buildConfirmPlan("draft", [
    { id: "l1", label: "Ana", talentProfileId: "ana", startsAt: T0, endsAt: T1 },
    { id: "l2", label: "Chair", poolId: "p", units: 1, startsAt: T0, endsAt: T1 },
  ]);
  assert.deepEqual(await runConfirmChecks(plan, readers({})), []);
});

test("runConfirmChecks: names the person and the date when the calendar overlaps", async () => {
  const plan = buildConfirmPlan("offer", [
    { id: "l1", label: "Ana", talentProfileId: "ana", startsAt: T0, endsAt: T1, timezone: "America/Mexico_City" },
  ]);
  const conflicts = await runConfirmChecks(
    plan,
    readers({
      busy: async () => [{ startsAt: new Date("2026-09-20T15:30:00.000Z"), endsAt: new Date("2026-09-20T17:00:00.000Z") }],
    }),
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.code, "person_busy");
  assert.equal(conflicts[0]?.line, "Ana");
  assert.equal(conflicts[0]?.why, "Ana is no longer free on 2026-09-20");
  assert.equal(conflicts[0]?.at, T0);
});

test("runConfirmChecks: a busy interval that only touches the edge is not an overlap", async () => {
  const plan = buildConfirmPlan("offer", [{ id: "l1", label: "Ana", talentProfileId: "ana", startsAt: T0, endsAt: T1 }]);
  const conflicts = await runConfirmChecks(
    plan,
    readers({ busy: async () => [{ startsAt: new Date(T1), endsAt: new Date("2026-09-20T17:00:00.000Z") }] }),
  );
  assert.deepEqual(conflicts, []);
});

test("runConfirmChecks: short capacity names the line; unknown capacity fails closed", async () => {
  const plan = buildConfirmPlan("draft", [
    { id: "l1", label: "VIP seats", poolId: "vip", units: 2, startsAt: T0, endsAt: T1 },
    { id: "l2", label: "Room B", poolId: "room-b", units: 1, startsAt: T0, endsAt: T1 },
    { id: "l3", label: "Stock item", poolId: "stock", units: 1 },
  ]);
  const conflicts = await runConfirmChecks(
    plan,
    readers({
      remaining: async (check) => (check.poolId === "vip" ? 1 : check.poolId === "room-b" ? null : 5),
    }),
  );
  assert.deepEqual(
    conflicts.map((c) => [c.code, c.why]),
    [
      ["capacity_short", "VIP seats is no longer free on 2026-09-20"],
      ["capacity_unknown", "Room B could not be checked"],
    ],
  );
});

test("runConfirmChecks: every conflict is reported, not just the first", async () => {
  const plan = buildConfirmPlan("offer", [
    { id: "l1", label: "Ana", talentProfileId: "ana", startsAt: T0, endsAt: T1 },
    { id: "l2", label: "Luis", talentProfileId: "luis", startsAt: T0, endsAt: T1 },
  ]);
  const conflicts = await runConfirmChecks(
    plan,
    readers({ busy: async () => [{ startsAt: new Date(T0), endsAt: new Date(T1) }] }),
  );
  assert.deepEqual(
    conflicts.map((c) => c.line),
    ["Ana", "Luis"],
  );
});

test("conflictDate: zoned when a timezone is given, UTC date otherwise, null when undated", () => {
  // 2026-09-21T03:30Z is still 2026-09-20 in Mexico City (UTC-6).
  assert.equal(conflictDate("2026-09-21T03:30:00.000Z", "America/Mexico_City"), "2026-09-20");
  assert.equal(conflictDate("2026-09-21T03:30:00.000Z", null), "2026-09-21");
  assert.equal(conflictDate(null, "America/Mexico_City"), null);
});
