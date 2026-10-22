/**
 * TUL-1349: collection re-checks every held line at payment time; TUL-1875:
 * an order carries the offering's currency and never mixes two.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addLine, createDraftOrder } from "./draft";
import { startCollection } from "./collection";
import { fakeAdmin, fakeTill, makeStore, seedOffering } from "./__fixtures__/commands-store";

async function heldSale(offering: Record<string, unknown> = {}) {
  const store = makeStore();
  seedOffering(store, offering);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("no draft");
  const added = await addLine(fakeAdmin(store), { tenantId: "t1", orderId: created.orderId, line: { offeringId: "off-1", units: 1 } });
  assert.equal(added.ok, true, JSON.stringify(added));
  return { store, orderId: created.orderId };
}

function collect(store: ReturnType<typeof makeStore>, orderId: string, method: "cash" | "online_card") {
  return startCollection(fakeTill(store), {
    tenantId: "t1",
    orderId,
    actorUserId: "u1",
    method,
    contact: method === "online_card" ? { email: "a@b.co" } : undefined,
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
    idempotencyKey: `pos-${method}:recheck-1`,
  }, {
    ensureCustomer: async () => ({ ok: true, customerId: "c1" }) as never,
  });
}

for (const method of ["cash", "online_card"] as const) {
  for (const [name, change] of [
    ["switched off for the counter", { pos_enabled: false }],
    ["unpublished", { status: "draft" }],
    ["archived", { status: "archived" }],
  ] as const) {
    test(`${method}: an item ${name} after it was held is refused and nothing is written`, async () => {
      const { store, orderId } = await heldSale();
      Object.assign(store.talent_offerings[0], change);
      const r = await collect(store, orderId, method);
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.reason, "item_unavailable");
      assert.equal(r.error, "This item is no longer available.");
      assert.equal(store.booking_transactions.length, 0);
      assert.equal(store.order_collection_reservations.length, 0);
      assert.equal(store.orders[0].status, "draft");
    });
  }
}

test("cash: an item still on the counter collects", async () => {
  const { store, orderId } = await heldSale({ pos_enabled: true });
  const r = await collect(store, orderId, "cash");
  assert.equal(r.ok, true, r.ok ? "" : r.error);
});

test("fail closed: an unreadable catalog refuses the collection", async () => {
  const { store, orderId } = await heldSale();
  const till = fakeTill(store);
  const from = till.from;
  const broken = {
    ...till,
    from: (table: string) => {
      if (table !== "talent_offerings") return from(table);
      const dead: Record<string, unknown> = {};
      for (const k of ["select", "eq", "in"]) dead[k] = () => dead;
      dead.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "XX000", message: "down" } }).then(res);
      return dead;
    },
  };
  const r = await startCollection(broken, {
    tenantId: "t1", orderId, actorUserId: "u1", method: "cash",
    successUrl: "https://app.test/ok", cancelUrl: "https://app.test/no", idempotencyKey: "pos-cash:recheck-2",
  });
  assert.equal(r.ok, false);
  assert.equal(store.booking_transactions.length, 0);
});

test("TUL-1875: an empty counter sale adopts the item's currency (MXN stays MXN)", async () => {
  const { store } = await heldSale({ currency: "MXN", amount_cents: 8000 });
  assert.equal(store.orders[0].currency, "MXN");
});

test("TUL-1875: a second item in another currency is refused", async () => {
  const { store, orderId } = await heldSale({ currency: "MXN" });
  seedOffering(store, { id: "off-2", currency: "USD" });
  const r = await addLine(fakeAdmin(store), { tenantId: "t1", orderId, line: { offeringId: "off-2", units: 1 } });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "invalid");
  assert.equal(store.order_lines.length, 1);
  assert.equal(store.orders[0].currency, "MXN");
});

test("TUL-1875: a second item in the same currency still adds", async () => {
  const { store, orderId } = await heldSale({ currency: "MXN" });
  seedOffering(store, { id: "off-2", currency: "MXN" });
  const r = await addLine(fakeAdmin(store), { tenantId: "t1", orderId, line: { offeringId: "off-2", units: 1 } });
  assert.equal(r.ok, true);
});
