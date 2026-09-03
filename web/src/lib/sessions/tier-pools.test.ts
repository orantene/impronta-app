/**
 * The windowing rule, enforced rather than documented.
 *
 * A timeless allocation on a session tier pool is correct only while that pool
 * has no ancestor shared across time. Once a tier hangs under a room, a timeless
 * allocation charges the room forever and a Tuesday class blocks Saturday's
 * event. These tests assert the request BUILDER cannot produce one.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_TIER_KEY, tierReserveBatch, tierReserveRequest } from "./tier-pools";

const SESSION = {
  id: "s1",
  startsAt: "2027-03-09T23:00:00.000Z",
  endsAt: "2027-03-10T00:00:00.000Z",
};

test("a request ALWAYS carries the session window — never timeless", () => {
  const r = tierReserveRequest(SESSION, "pool-ga", 2);
  assert.ok(r);
  assert.equal(r.startsAt, SESSION.startsAt);
  assert.equal(r.endsAt, SESSION.endsAt);
  assert.notEqual(r.startsAt, null, "a null window is the bug this prevents");
  assert.notEqual(r.endsAt, null);
  assert.equal(r.units, 2);
});

test("there is no way to ask for a timeless request", () => {
  // The signature takes a session, not a window, so a caller cannot pass nulls.
  // The only route to a null window is a malformed session, which returns null.
  for (const bad of [
    { ...SESSION, startsAt: "" },
    { ...SESSION, endsAt: "" },
    { ...SESSION, startsAt: "not-a-date" },
    { ...SESSION, endsAt: SESSION.startsAt },
    { ...SESSION, endsAt: "2027-03-09T22:00:00.000Z" },
  ]) {
    assert.equal(tierReserveRequest(bad, "pool-ga"), null, JSON.stringify(bad));
  }
});

test("nonsense units are refused rather than rounded into a sale", () => {
  for (const u of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(tierReserveRequest(SESSION, "pool-ga", u), null, String(u));
  }
  assert.equal(tierReserveRequest(SESSION, "pool-ga", 2.4)?.units, 2);
});

test("a missing pool id is refused", () => {
  assert.equal(tierReserveRequest(SESSION, ""), null);
});

test("a batch attributes each leg to its OWN order line", () => {
  const batch = tierReserveBatch(SESSION, [
    { poolId: "pool-ga", units: 2, orderLineId: "line-ga" },
    { poolId: "pool-vip", units: 1, orderLineId: "line-vip" },
  ]);
  assert.ok(batch);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].orderLineId, "line-ga");
  assert.equal(batch[1].orderLineId, "line-vip");
  // Shared attribution is what makes refund-by-line free the wrong seats.
  assert.notEqual(batch[0].orderLineId, batch[1].orderLineId);
  for (const leg of batch) assert.equal(leg.startsAt, SESSION.startsAt);
});

test("a batch with ANY malformed leg builds nothing, so no partial cart exists", () => {
  const batch = tierReserveBatch(SESSION, [
    { poolId: "pool-ga", units: 2 },
    { poolId: "", units: 1 },
  ]);
  assert.equal(batch, null);
  assert.equal(tierReserveBatch(SESSION, []), null);
});

test("the default tier key matches the capacity engine's default pool_key", () => {
  assert.equal(DEFAULT_TIER_KEY, "default");
});
