/**
 * Hold TTL is per pool, and a transport failure is not a missing pool.
 * Two small changes from capacity 0.9; both are about telling the truth to
 * someone who is waiting.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { RESERVATION_HOLD_TTL_MS, holdTtlMs } from "@/lib/scheduling/reservation-hold";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("no TTL falls back to the 48h default", () => {
  assert.equal(holdTtlMs(undefined), RESERVATION_HOLD_TTL_MS);
  assert.equal(holdTtlMs(null), RESERVATION_HOLD_TTL_MS);
});

test("a pool TTL is honoured", () => {
  assert.equal(holdTtlMs(600), 600_000, "ten minutes, a ticket");
  assert.equal(holdTtlMs(900), 900_000, "fifteen minutes, a table");
});

test("nonsense never costs someone their slot — it falls back, it does not throw", () => {
  assert.equal(holdTtlMs(0), RESERVATION_HOLD_TTL_MS);
  assert.equal(holdTtlMs(-60), RESERVATION_HOLD_TTL_MS);
  assert.equal(holdTtlMs(29), RESERVATION_HOLD_TTL_MS, "below the pool floor");
  assert.equal(holdTtlMs(604_801), RESERVATION_HOLD_TTL_MS, "above the pool ceiling");
  assert.equal(holdTtlMs(Number.NaN), RESERVATION_HOLD_TTL_MS);
  assert.equal(holdTtlMs(Number.POSITIVE_INFINITY), RESERVATION_HOLD_TTL_MS);
});

test("the bounds match capacity_pools.hold_ttl_seconds exactly", () => {
  assert.equal(holdTtlMs(30), 30_000, "the pool floor must be accepted");
  assert.equal(holdTtlMs(604_800), 604_800_000, "the pool ceiling must be accepted");
});

test("a transport failure reports unavailable, never pool_not_found", () => {
  const src = read("lib/capacity/reserve.ts");
  assert.ok(
    /function transportFailure[\s\S]*?return "unavailable";/.test(src),
    'transportFailure must return "unavailable" — "this does not exist" ends a visit, "try again" does not',
  );
  assert.ok(
    !/return "pool_not_found";/.test(src),
    "an outage must never be reported as a missing pool",
  );
});

test("a pooled offering's calendar hold uses the pool clock", () => {
  const src = read("lib/inquiry/instant-book-engine.ts");
  assert.ok(
    src.includes("ttlSeconds: await capacityHoldTtlSeconds(offering?.capacityPoolId ?? null, admin)"),
    "instant-book must pass the pool TTL so the slot and the units lapse together",
  );
});
