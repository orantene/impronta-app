/**
 * createDraftOrder without an explicit currency follows the workspace
 * `agencies.default_currency`; it never falls back to USD.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftOrder } from "./draft";
import { fakeAdmin, makeStore } from "./__fixtures__/commands-store";

const INPUT = { tenantId: "t1", actorUserId: "u1" };

test("no currency: the workspace default is used (MXN)", async () => {
  const store = makeStore();
  store.agencies.push({ id: "t1", default_currency: "mxn" });
  const created = await createDraftOrder(fakeAdmin(store), INPUT);
  assert.equal(created.ok, true);
  assert.equal(store.orders[0]?.currency, "MXN");
});

test("no currency and a default-less fixture: the fixture serves USD", async () => {
  const store = makeStore();
  const created = await createDraftOrder(fakeAdmin(store), INPUT);
  assert.equal(created.ok, true);
  assert.equal(store.orders[0]?.currency, "USD");
});

test("no currency and an unreadable workspace default: refuses, writes nothing", async () => {
  for (const bad of [null, "", "US", "dollars", 42]) {
    const store = makeStore();
    store.agencies.push({ id: "t1", default_currency: bad });
    const created = await createDraftOrder(fakeAdmin(store), INPUT);
    assert.equal(created.ok, false, `default ${String(bad)}`);
    if (!created.ok) assert.equal(created.reason, "unavailable");
    assert.equal(store.orders.length, 0);
  }
});

test("an explicit currency wins over the workspace default", async () => {
  const store = makeStore();
  store.agencies.push({ id: "t1", default_currency: "MXN" });
  const created = await createDraftOrder(fakeAdmin(store), { ...INPUT, currency: "eur" });
  assert.equal(created.ok, true);
  assert.equal(store.orders[0]?.currency, "EUR");
});

test("a failed default read refuses without throwing", async () => {
  const failing = {
    from: () => {
      throw new Error("db down");
    },
  } as unknown as Parameters<typeof createDraftOrder>[0];
  const created = await createDraftOrder(failing, INPUT);
  assert.equal(created.ok, false);
});
