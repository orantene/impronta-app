import assert from "node:assert/strict";
import test from "node:test";

import { loadSeriesPoolPlan } from "./series-pools";
import { TIER_POOLS_FLAG, tierPoolsEnabled } from "./series-tiers";

function admin() {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const b: Record<string, unknown> = {};
      const chain = () => b;
      b.select = chain; b.eq = chain; b.order = chain;
      b.maybeSingle = async () => ({ data: { tier_quotas: { child: 6 } }, error: null });
      b.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: [{ pool_key: "adult", sort_order: 1 }, { pool_key: "child", sort_order: 2 }], error: null }).then(ok);
      return b;
    },
  };
}

const args = { tenantId: "t", seriesId: "s", offeringId: "o", seats: 20 };

async function withFlag<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const prev = process.env[TIER_POOLS_FLAG];
  if (value === undefined) delete process.env[TIER_POOLS_FLAG];
  else process.env[TIER_POOLS_FLAG] = value;
  try {
    return await run();
  } finally {
    if (prev === undefined) delete process.env[TIER_POOLS_FLAG];
    else process.env[TIER_POOLS_FLAG] = prev;
  }
}

test("the flag is on only for exactly 'true'", () => {
  assert.equal(tierPoolsEnabled({}), false);
  assert.equal(tierPoolsEnabled({ [TIER_POOLS_FLAG]: "1" }), false);
  assert.equal(tierPoolsEnabled({ [TIER_POOLS_FLAG]: "TRUE" }), false);
  assert.equal(tierPoolsEnabled({ [TIER_POOLS_FLAG]: "true" }), true);
});

test("flag OFF (default): the single default pool and not one database read", async () => {
  const a = admin();
  const plan = await withFlag(undefined, () => loadSeriesPoolPlan(a as never, args));
  assert.deepEqual(plan, [{ poolKey: "default", units: 20 }]);
  assert.deepEqual(a.calls, []);
});

test("flag ON: a default total plus a capped child per tier", async () => {
  const plan = await withFlag("true", () => loadSeriesPoolPlan(admin() as never, args));
  assert.deepEqual(plan, [
    { poolKey: "default", units: 20 },
    { poolKey: "adult", units: 20, parentPoolKey: "default" },
    { poolKey: "child", units: 6, parentPoolKey: "default" },
  ]);
});
