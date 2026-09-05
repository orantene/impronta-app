/**
 * UNIT TEST — session-plan.ts.
 *
 * Runs in `test:sessions` (glob lane). `tsx --test` executes, it does not
 * typecheck: a green lane here is not a green branch.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  DEFAULT_POOL_KEY,
  describeSessionRefusal,
  planSession,
  type SessionPlanRefusal,
} from "./session-plan";

const WINDOW = { startsAt: "2026-09-12T18:00:00.000Z", endsAt: "2026-09-12T20:00:00.000Z" };
const KEYS = ["ga", "vip"];

test("a well formed night plans one pool per tier, in order", () => {
  const plan = planSession({
    ...WINDOW,
    tiers: [
      { poolKey: "ga", units: 300 },
      { poolKey: "vip", units: 6 },
    ],
    knownPoolKeys: KEYS,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.pools, [
    { poolKey: "ga", units: 300 },
    { poolKey: "vip", units: 6 },
  ]);
});

// ── The refusal this module exists for ─────────────────────────────────────

test("a DUPLICATE pool key is refused, because the upsert would silently keep the LAST number", () => {
  // The whole point. upsert_capacity_pool is ON CONFLICT DO UPDATE SET
  // units_total = EXCLUDED, so [{ga,300},{ga,6}] does not error and does not
  // make two pools — it makes ONE pool with 6 seats. A venue that meant 300
  // opens the doors to 6, and one pool with a plausible number is exactly what
  // a correct plan looks like from every angle downstream.
  const plan = planSession({
    ...WINDOW,
    tiers: [
      { poolKey: "ga", units: 300 },
      { poolKey: "ga", units: 6 },
    ],
    knownPoolKeys: KEYS,
  });
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.equal(plan.reason, "duplicate_pool_key");
  // The operator has to be told WHICH tier, or they cannot fix it.
  assert.equal(plan.poolKey, "ga");
});

test("a session with NO pools is refused, not created empty", () => {
  // A session with no pool is not a session with unlimited seats: it renders
  // correctly everywhere and refuses every purchase, because the picker
  // resolves (session_tier, session.id, pool_key) and finds nothing.
  const plan = planSession({ ...WINDOW, tiers: [], knownPoolKeys: KEYS });
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.equal(plan.reason, "no_pools");
});

test("an UNKNOWN pool key is refused rather than creating seats nothing can sell", () => {
  // A typo in a form field otherwise creates a real pool that no tier resolves.
  const plan = planSession({
    ...WINDOW,
    tiers: [{ poolKey: "gaa", units: 300 }],
    knownPoolKeys: KEYS,
  });
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.equal(plan.reason, "unknown_pool_key");
  assert.equal(plan.poolKey, "gaa");
});

test("ZERO seats is refused — it is the no-pool failure wearing a different mask", () => {
  for (const units of [0, -3, 2.5, Number.NaN]) {
    const plan = planSession({
      ...WINDOW,
      tiers: [{ poolKey: "ga", units }],
      knownPoolKeys: KEYS,
    });
    assert.equal(plan.ok, false, `units=${units}`);
    if (plan.ok) return;
    assert.equal(plan.reason, "bad_units");
    assert.equal(plan.poolKey, "ga");
  }
});

// ── The window, refused here rather than by a constraint name ──────────────

test("an end at or before the start is refused before the database sees it", () => {
  for (const endsAt of [WINDOW.startsAt, "2026-09-12T17:00:00.000Z"]) {
    const plan = planSession({
      startsAt: WINDOW.startsAt,
      endsAt,
      tiers: [{ poolKey: "ga", units: 10 }],
      knownPoolKeys: KEYS,
    });
    assert.equal(plan.ok, false, endsAt);
    if (plan.ok) return;
    assert.equal(plan.reason, "bad_window");
  }
});

test("an unparseable start and an unparseable end are DISTINCT refusals", () => {
  // One field is wrong; the operator should be told which one.
  const badStart = planSession({
    startsAt: "not a date",
    endsAt: WINDOW.endsAt,
    tiers: [{ poolKey: "ga", units: 10 }],
    knownPoolKeys: KEYS,
  });
  const badEnd = planSession({
    startsAt: WINDOW.startsAt,
    endsAt: "not a date",
    tiers: [{ poolKey: "ga", units: 10 }],
    knownPoolKeys: KEYS,
  });
  assert.equal(badStart.ok, false);
  assert.equal(badEnd.ok, false);
  if (badStart.ok || badEnd.ok) return;
  assert.equal(badStart.reason, "bad_start");
  assert.equal(badEnd.reason, "bad_end");
  assert.notEqual(badStart.reason, badEnd.reason);
});

// ── The eventless session ──────────────────────────────────────────────────

test("with no event, the DEFAULT key is the only one admitted", () => {
  const ok = planSession({
    ...WINDOW,
    tiers: [{ poolKey: DEFAULT_POOL_KEY, units: 12 }],
    knownPoolKeys: [],
  });
  assert.equal(ok.ok, true);

  const nope = planSession({
    ...WINDOW,
    tiers: [{ poolKey: "vip", units: 6 }],
    knownPoolKeys: [],
  });
  assert.equal(nope.ok, false);
  if (nope.ok) return;
  assert.equal(nope.reason, "unknown_pool_key");
});

test("a blank or whitespace pool key is refused, not trimmed into the default", () => {
  for (const poolKey of ["", "   "]) {
    const plan = planSession({
      ...WINDOW,
      tiers: [{ poolKey, units: 10 }],
      knownPoolKeys: KEYS,
    });
    assert.equal(plan.ok, false, JSON.stringify(poolKey));
    if (plan.ok) return;
    assert.equal(plan.reason, "blank_pool_key");
  }
});

test("surrounding whitespace on a real key is trimmed rather than refused", () => {
  const plan = planSession({
    ...WINDOW,
    tiers: [{ poolKey: "  ga  ", units: 10 }],
    knownPoolKeys: KEYS,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.pools[0]?.poolKey, "ga");
});

test("timestamps come back NORMALISED, so the writer stores one shape", () => {
  const plan = planSession({
    startsAt: "2026-09-12T18:00:00+00:00",
    endsAt: "2026-09-12T20:00:00+00:00",
    tiers: [{ poolKey: "ga", units: 10 }],
    knownPoolKeys: KEYS,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.startsAt, "2026-09-12T18:00:00.000Z");
  assert.equal(plan.endsAt, "2026-09-12T20:00:00.000Z");
});

// ── The operator's sentence ────────────────────────────────────────────────

test("EVERY refusal has a sentence, and the ones with a key name it", () => {
  // Guard-of-a-guard: this is what bites when somebody adds a refusal reason
  // and leaves the operator staring at an empty error box.
  const all: SessionPlanRefusal[] = [
    { reason: "bad_start" },
    { reason: "bad_end" },
    { reason: "bad_window" },
    { reason: "no_pools" },
    { reason: "blank_pool_key" },
    { reason: "duplicate_pool_key", poolKey: "ga" },
    { reason: "unknown_pool_key", poolKey: "gaa" },
    { reason: "bad_units", poolKey: "vip" },
  ];
  for (const r of all) {
    const sentence = describeSessionRefusal(r);
    assert.ok(sentence.length > 0, r.reason);
    // No em dashes in copy, staff surface included.
    assert.equal(sentence.includes("—"), false, r.reason);
    if ("poolKey" in r) {
      assert.ok(sentence.includes(r.poolKey), `${r.reason} must name the tier`);
    }
  }
});
