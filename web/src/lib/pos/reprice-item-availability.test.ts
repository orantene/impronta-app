/**
 * TUL-1349: an item that was unpublished (or archived) AFTER it went into an
 * open cart must not pass repriceAndValidate. Refusal only: no price, fee or
 * amount is changed, and nothing is written when it refuses.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { addLine, createDraftOrder, repriceAndValidate } from "./draft";
import { fakeAdmin, makeStore, seedOffering } from "./__fixtures__/commands-store";

async function openCartWithItem() {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("no draft");
  const added = await addLine(fakeAdmin(store), { tenantId: "t1", orderId: created.orderId, line: { offeringId: "off-1", units: 2 } });
  assert.equal(added.ok, true);
  return { store, orderId: created.orderId };
}

test("a published item still reprices", async () => {
  const { store, orderId } = await openCartWithItem();
  const r = await repriceAndValidate(fakeAdmin(store), { tenantId: "t1", orderId });
  assert.equal(r.ok, true);
});

for (const status of ["draft", "archived", "paused"]) {
  test(`an item that became ${status} after it was added is refused, and nothing is rewritten`, async () => {
    const { store, orderId } = await openCartWithItem();
    store.talent_offerings[0].status = status;
    const before = JSON.stringify(store.order_lines);
    const r = await repriceAndValidate(fakeAdmin(store), { tenantId: "t1", orderId });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "item_unavailable");
    assert.equal(JSON.stringify(store.order_lines), before);
  });
}

test("the refusal has ES and EN copy on the counter and the storefront", () => {
  for (const f of ["en", "es"]) {
    const j = JSON.parse(readFileSync(join(process.cwd(), "messages", `${f}.json`), "utf8"));
    const s = j.dashboard.pos.engine.refusal.item_unavailable as string;
    assert.ok(s && s.length > 0, f);
  }
  const en = readFileSync(join(process.cwd(), "messages", "en.json"), "utf8");
  const es = readFileSync(join(process.cwd(), "messages", "es.json"), "utf8");
  assert.match(en, /This item is no longer available\./);
  assert.match(es, /Este artículo ya no está disponible\./);
  assert.match(readFileSync(join(process.cwd(), "src/lib/storefront/refusals.ts"), "utf8"), /item_unavailable:/);
  assert.match(readFileSync(join(process.cwd(), "src/components/admin/pos/pos-copy-engine.ts"), "utf8"), /item_unavailable/);
});
