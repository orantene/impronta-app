import test from "node:test";
import assert from "node:assert/strict";

import { reserveCapacityBatch } from "./reserve";

/**
 * The per-leg TTL must actually reach the RPC payload.
 *
 * A REAL test, not a source scan: `reserveCapacityBatch` takes an injectable
 * `Rpc`, so the payload can be captured and inspected. That matters here
 * specifically — the defect was that the SQL read a key the TypeScript mapper
 * never sent, and a static test asserting "the file mentions ttl_seconds" would
 * have passed on the broken version too, because the SQL comment mentions it.
 */
type Captured = { fn: string; args: Record<string, unknown> } | null;

function fakeRpc(result: unknown = { ok: true, allocation_ids: ["a1"], expires_at: null }) {
  let captured: Captured = null;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    captured = { fn, args };
    return { data: result, error: null };
  };
  return { rpc: rpc as never, seen: () => captured };
}

function legs(payload: Captured): Array<Record<string, unknown>> {
  return (payload?.args.p_requests ?? []) as Array<Record<string, unknown>>;
}

test("a per-leg ttlSeconds REACHES the payload", () => {
  // The whole defect. Before this, the mapper sent five keys and dropped the
  // sixth, so a caller could set `ttlSeconds` on a leg and nothing happened.
  const f = fakeRpc();
  return reserveCapacityBatch(
    [{ poolId: "p1", units: 1, ttlSeconds: 6 * 60 * 60 }],
    {},
    { rpc: f.rpc },
  ).then(() => {
    assert.equal(legs(f.seen())[0]?.ttl_seconds, 6 * 60 * 60);
  });
});

test("legs carry DIFFERENT clocks in one batch — the point of per-leg", () => {
  // A door ticket holding until the session ends, beside a coffee on the pool's
  // own TTL. Collapsing these to one value is what the exemption exists to stop.
  const f = fakeRpc();
  return reserveCapacityBatch(
    [
      { poolId: "door", units: 1, ttlSeconds: 6 * 60 * 60 },
      { poolId: "coffee", units: 2 },
    ],
    { ttlSeconds: 900 },
    { rpc: f.rpc },
  ).then(() => {
    const l = legs(f.seen());
    assert.equal(l[0]?.ttl_seconds, 6 * 60 * 60, "the door leg keeps its own clock");
    assert.equal(l[1]?.ttl_seconds, null, "the coffee falls through to the batch value");
    assert.equal(f.seen()?.args.p_ttl_seconds, 900, "and the batch value is still sent");
  });
});

test("an absent ttlSeconds sends NULL, not undefined or a zero", () => {
  // The SQL does `COALESCE(NULLIF(r->>'ttl_seconds','')::int, p_ttl_seconds)`.
  // A JSON `undefined` drops the key (fine), but a 0 would be a hold that
  // expires immediately, and an empty string a cast error. NULL is the value
  // that falls through as intended.
  const f = fakeRpc();
  return reserveCapacityBatch([{ poolId: "p1", units: 1 }], {}, { rpc: f.rpc }).then(() => {
    assert.strictEqual(legs(f.seen())[0]?.ttl_seconds, null);
  });
});

test("the other per-leg keys still travel — this changed one field, not the shape", () => {
  const f = fakeRpc();
  return reserveCapacityBatch(
    [{ poolId: "p1", units: 3, startsAt: "2026-09-06T18:00:00.000Z", endsAt: null, orderLineId: "line1" }],
    {},
    { rpc: f.rpc },
  ).then(() => {
    const leg = legs(f.seen())[0]!;
    assert.equal(leg.pool_id, "p1");
    assert.equal(leg.units, 3);
    assert.equal(leg.starts_at, "2026-09-06T18:00:00.000Z");
    assert.equal(leg.order_line_id, "line1");
  });
});
