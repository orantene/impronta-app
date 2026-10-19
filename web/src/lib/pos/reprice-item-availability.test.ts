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

async function openCartWithItem(opts: { channel?: string; offering?: Record<string, unknown>; variant?: Record<string, unknown> } = {}) {
  const store = makeStore();
  seedOffering(store, { visibility: "public", moderation_state: "approved", ...(opts.offering ?? {}) });
  if (opts.variant) store.talent_offering_variants.push({ id: "var-1", offering_id: "off-1", label: "Large", amount_cents: 6000, is_hidden: false, ...opts.variant });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1", ...(opts.channel ? { sourceChannel: opts.channel } : {}) });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("no draft");
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 2, ...(opts.variant ? { variantId: "var-1" } : {}) },
  });
  assert.equal(added.ok, true, JSON.stringify(added));
  return { store, orderId: created.orderId };
}

const GUEST = "storefront:pickup";

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

// The GUEST cart is held to D-10 / D-10a: published AND approved AND public.
for (const [name, offering] of [
  ["agency_only", { visibility: "agency_only" }],
  ["on_request", { visibility: "on_request" }],
  ["rejected", { moderation_state: "rejected" }],
  ["pending", { moderation_state: "pending" }],
] as const) {
  test(`guest cart: an item that became ${name} (still published) is refused`, async () => {
    const { store, orderId } = await openCartWithItem({ channel: GUEST });
    Object.assign(store.talent_offerings[0], offering);
    const before = JSON.stringify(store.order_lines);
    const r = await repriceAndValidate(fakeAdmin(store), { tenantId: "t1", orderId });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "item_unavailable");
    assert.equal(JSON.stringify(store.order_lines), before);
  });
}

test("guest cart: a public, approved, published item still reprices", async () => {
  const { store, orderId } = await openCartWithItem({ channel: GUEST });
  assert.equal((await repriceAndValidate(fakeAdmin(store), { tenantId: "t1", orderId })).ok, true);
});

test("an unknown source channel is held to the guest rule (fail closed)", async () => {
  const { store, orderId } = await openCartWithItem({ channel: "mystery" });
  store.talent_offerings[0].visibility = "agency_only";
  assert.equal((await repriceAndValidate(fakeAdmin(store), { tenantId: "t1", orderId })).ok, false);
});

test("POS staff keep the status-only rule: an agency_only item still sells at the desk", async () => {
  const { store, orderId } = await openCartWithItem();
  store.talent_offerings[0].visibility = "agency_only";
  assert.equal((await repriceAndValidate(fakeAdmin(store), { tenantId: "t1", orderId })).ok, true);
});

for (const channel of [undefined, GUEST]) {
  test(`${channel ?? "pos"}: a chosen variant that was hidden, deleted or moved is refused`, async () => {
    for (const mutate of [
      (st: ReturnType<typeof makeStore>) => { st.talent_offering_variants[0].is_hidden = true; },
      (st: ReturnType<typeof makeStore>) => { st.talent_offering_variants.length = 0; },
      (st: ReturnType<typeof makeStore>) => { st.talent_offering_variants[0].offering_id = "other"; },
    ]) {
      const { store, orderId } = await openCartWithItem({ channel, variant: {} });
      mutate(store);
      const r = await repriceAndValidate(fakeAdmin(store), { tenantId: "t1", orderId });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.reason, "item_unavailable");
    }
  });
}

test("a visible variant still reprices", async () => {
  const { store, orderId } = await openCartWithItem({ variant: {} });
  assert.equal((await repriceAndValidate(fakeAdmin(store), { tenantId: "t1", orderId })).ok, true);
});

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
