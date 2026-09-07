/**
 * UNIT TEST — seats-left.ts, and the count actually MOVING when a reservation
 * lands on the pool.
 *
 * The second half is the point. A formatter can be perfect while the number it
 * formats never changes, so this drives the real capacity rule
 * (`remainingUnits`, the TypeScript twin of the SQL) with a live allocation and
 * asserts the rendered sentence moves with it.
 *
 * Runs in `test:sessions` (glob lane). `tsx --test` executes, it does not
 * typecheck: a green lane is not a green branch.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { remainingUnits } from "@/lib/capacity/remaining";
import type { CapacityAllocation, CapacityPool } from "@/lib/capacity/types";
import { describeSeatsLeft, seatsLeft } from "./seats-left";

// The Posing course's cohort pool: ONE pool of 12 on the OFFERING, parentless,
// with no window — twelve seats to a course, not twelve per night.
const COHORT: CapacityPool = {
  id: "pool-cohort",
  tenantId: "t1",
  subjectKind: "offering",
  subjectId: "offering-posing",
  poolKey: "default",
  unitsTotal: 12,
  overbookUnits: 0,
  holdTtlSeconds: 900,
  unitLabel: "seat",
  isActive: true,
  parentPoolId: null,
  poolPath: ["pool-cohort"],
};

function committed(id: string, units: number): CapacityAllocation {
  return {
    id,
    poolId: COHORT.id,
    poolPath: ["pool-cohort"],
    units,
    state: "committed",
    startsAt: null,
    endsAt: null,
    expiresAt: null,
    orderLineId: null,
  };
}

// ── The count moves when a reservation lands ───────────────────────────────

test("a reservation landing on the pool MOVES the sentence", () => {
  const before = remainingUnits(COHORT, []);
  assert.equal(
    describeSeatsLeft(seatsLeft(before, COHORT.unitsTotal), "en"),
    "12 of 12 left",
  );

  // One seat sold.
  const afterOne = remainingUnits(COHORT, [committed("a1", 1)]);
  assert.equal(
    describeSeatsLeft(seatsLeft(afterOne, COHORT.unitsTotal), "en"),
    "11 of 12 left",
  );

  // Nine more, the state the CEO's example describes.
  const afterNine = remainingUnits(COHORT, [committed("a1", 1), committed("a2", 8)]);
  assert.equal(
    describeSeatsLeft(seatsLeft(afterNine, COHORT.unitsTotal), "en"),
    "3 of 12 left",
  );
});

test("the twelfth seat sells out and the THIRTEENTH does not go negative", () => {
  const full = remainingUnits(COHORT, [committed("a1", 12)]);
  assert.equal(full, 0);
  assert.equal(describeSeatsLeft(seatsLeft(full, 12), "en"), "Sold out");

  // remainingUnits never returns a negative; the display must not invent one
  // even if it were handed one.
  assert.equal(describeSeatsLeft(seatsLeft(-3, 12), "en"), "Sold out");
});

test("a LAPSED hold gives its seat back to the sentence", () => {
  // A hold that has expired stops consuming, so the count must recover. A
  // reaper that runs late costs table size and nothing else.
  const lapsed: CapacityAllocation = {
    ...committed("h1", 4),
    state: "hold",
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  };
  const live: CapacityAllocation = {
    ...lapsed,
    id: "h2",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(describeSeatsLeft(seatsLeft(remainingUnits(COHORT, [lapsed]), 12), "en"), "12 of 12 left");
  assert.equal(describeSeatsLeft(seatsLeft(remainingUnits(COHORT, [live]), 12), "en"), "8 of 12 left");
});

// ── Refusing to speak ──────────────────────────────────────────────────────

test("NULL remaining says NOTHING, because a missing pool is not a full course", () => {
  // capacity_remaining_public returns NULL for a pool that is absent or off.
  // Rendering "Sold out" there would tell a customer a course is full when
  // nothing was ever limited, and nobody reports a sale they were quietly
  // refused.
  for (const bad of [null, undefined]) {
    assert.equal(seatsLeft(bad, 12).kind, "unknown");
    assert.equal(describeSeatsLeft(seatsLeft(bad, 12), "en"), null);
  }
});

test("a pool of ZERO units is unconfigured, not sold out", () => {
  assert.equal(seatsLeft(0, 0).kind, "unknown");
  assert.equal(describeSeatsLeft(seatsLeft(0, 0), "en"), null);
});

test("a non-finite count says nothing rather than rendering NaN", () => {
  assert.equal(describeSeatsLeft(seatsLeft(Number.NaN, 12), "en"), null);
  assert.equal(describeSeatsLeft(seatsLeft(5, Number.NaN), "en"), null);
});

test("remaining above total is CLAMPED, so no page ever says 13 of 12", () => {
  // Two reads at different moments, or a pool shrunk under a live hold.
  assert.equal(describeSeatsLeft(seatsLeft(13, 12), "en"), "12 of 12 left");
});

// ── Both languages ─────────────────────────────────────────────────────────

test("es is a real sentence, not a template with an English word in it", () => {
  assert.equal(describeSeatsLeft(seatsLeft(3, 12), "es"), "Quedan 3 de 12");
  assert.equal(describeSeatsLeft(seatsLeft(0, 12), "es"), "Agotado");
});

test("an unknown locale falls back to en rather than rendering a key", () => {
  for (const locale of ["fr", "", undefined, "zz-ZZ"]) {
    assert.equal(describeSeatsLeft(seatsLeft(3, 12), locale), "3 of 12 left");
  }
  // A regional Spanish still gets Spanish.
  assert.equal(describeSeatsLeft(seatsLeft(3, 12), "es-MX"), "Quedan 3 de 12");
});

test("no em dashes in any rendered sentence", () => {
  const all = [
    describeSeatsLeft(seatsLeft(3, 12), "en"),
    describeSeatsLeft(seatsLeft(3, 12), "es"),
    describeSeatsLeft(seatsLeft(0, 12), "en"),
    describeSeatsLeft(seatsLeft(0, 12), "es"),
  ];
  for (const s of all) {
    assert.ok(s);
    assert.equal(s!.includes("—"), false, s ?? "");
  }
});
