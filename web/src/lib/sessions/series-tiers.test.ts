import assert from "node:assert/strict";
import test from "node:test";

import { parentsFirst } from "./session-writer";
import { parseSalesCloseMinutes, parseTierQuotas, planSeriesPools } from "./series-tiers";

test("no tiers: exactly today's single default pool, parentless", () => {
  assert.deepEqual(planSeriesPools({ seats: 12, tierKeys: [], tierQuotas: null }), {
    ok: true,
    pools: [{ poolKey: "default", units: 12 }],
  });
});

test("tiers: a default parent with the series seats and one child per tier", () => {
  const plan = planSeriesPools({ seats: 20, tierKeys: ["adult", "child"], tierQuotas: { child: 6 } });
  assert.deepEqual(plan, {
    ok: true,
    pools: [
      { poolKey: "default", units: 20 },
      { poolKey: "adult", units: 20, parentPoolKey: "default" },
      { poolKey: "child", units: 6, parentPoolKey: "default" },
    ],
  });
});

test("a quota above the seats is capped at the seats; a quota is never raised", () => {
  const plan = planSeriesPools({ seats: 10, tierKeys: ["adult"], tierQuotas: { adult: 99 } });
  assert.ok(plan.ok);
  assert.equal(plan.pools[1].units, 10);
});

test("refuses zero seats, a duplicate or blank key, and a quota for a tier that does not exist", () => {
  assert.deepEqual(planSeriesPools({ seats: 0, tierKeys: [], tierQuotas: null }), { ok: false, reason: "no_seats" });
  assert.deepEqual(planSeriesPools({ seats: 5, tierKeys: ["a", "a"], tierQuotas: null }), {
    ok: false,
    reason: "duplicate_tier",
    poolKey: "a",
  });
  assert.deepEqual(planSeriesPools({ seats: 5, tierKeys: [" "], tierQuotas: null }), { ok: false, reason: "blank_tier" });
  assert.deepEqual(planSeriesPools({ seats: 5, tierKeys: ["a"], tierQuotas: { b: 2 } }), {
    ok: false,
    reason: "unknown_quota_key",
    poolKey: "b",
  });
  // "default" is the parent, never a tier of its own
  assert.deepEqual(planSeriesPools({ seats: 5, tierKeys: ["default"], tierQuotas: null }), {
    ok: false,
    reason: "reserved_tier_key",
    poolKey: "default",
  });
});

test("parseTierQuotas keeps positive integers and drops everything else", () => {
  assert.equal(parseTierQuotas(null), null);
  assert.equal(parseTierQuotas([1, 2]), null);
  assert.equal(parseTierQuotas("x"), null);
  assert.deepEqual(parseTierQuotas({ a: 3, b: 0, c: -1, d: 1.5, e: "4" }), { a: 3 });
  assert.equal(parseTierQuotas({ b: 0 }), null);
});

test("parseSalesCloseMinutes: non-negative whole minutes up to a year, otherwise null", () => {
  assert.equal(parseSalesCloseMinutes(90), 90);
  assert.equal(parseSalesCloseMinutes(0), 0);
  assert.equal(parseSalesCloseMinutes(-5), null);
  assert.equal(parseSalesCloseMinutes(2.5), null);
  assert.equal(parseSalesCloseMinutes(525601), null);
  assert.equal(parseSalesCloseMinutes("30"), null);
  assert.equal(parseSalesCloseMinutes(null), null);
});

test("parents are written before their children", () => {
  const order = parentsFirst([
    { poolKey: "adult", units: 5, parentPoolKey: "default" },
    { poolKey: "default", units: 5 },
  ]).map((p) => p.poolKey);
  assert.deepEqual(order, ["default", "adult"]);
});
