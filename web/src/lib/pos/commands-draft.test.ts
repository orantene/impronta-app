/**
 * L53 commands that build and edit a draft, split out of `commands.test.ts`
 * when that file passed the 800-line budget. This half covers the command
 * registry and everything that mutates a draft before money is involved:
 * creating it, adding/updating lines, promo attach, and tenant isolation on
 * those writes. Collection, preparation and cancel/finalize live in the
 * sibling `commands-collection.test.ts`. The shared fake store moved to
 * `__fixtures__/commands-store.ts` so neither half has to carry it alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { POS_COMMANDS, isPosCommand, posGuestSessionId } from "./commands";
import { addLine, createDraftOrder, repriceAndValidate, updateLine } from "./draft";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeAdmin, makeStore, seedOffering } from "./__fixtures__/commands-store";

test("POS command names are the L53 set", () => {
  assert.deepEqual([...POS_COMMANDS], [
    "createDraftOrder",
    "addLine",
    "updateLine",
    "removeLine",
    "repriceAndValidate",
    "submitToPreparation",
    "startCollection",
    "recordVerifiedCollection",
    "finalizeOrCancel",
  ]);
  assert.equal(isPosCommand("addLine"), true);
  assert.equal(isPosCommand("createPurchase"), false);
});

test("a walk-in draft exists without a customer", async () => {
  const store = makeStore();
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const row = store.orders[0];
  assert.equal(row.customer_id, null);
  assert.equal(row.status, "draft");
  assert.equal(row.source_channel, "pos");
  assert.equal(typeof row.guest_session_id, "string");
  assert.match(String(row.guest_session_id), /^pos:/);
  assert.match(posGuestSessionId(), /^pos:/);
});

test("line mutation does not import or call createPurchase", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/pos/draft.ts"), "utf8");
  assert.doesNotMatch(src, /createPurchase/);
  const addFn = src.slice(src.indexOf("export async function addLine"), src.indexOf("export async function updateLine"));
  const updateFn = src.slice(src.indexOf("export async function updateLine"), src.indexOf("export async function removeLine"));
  const removeFn = src.slice(src.indexOf("export async function removeLine"), src.indexOf("export type RepriceResult"));
  assert.doesNotMatch(addFn, /promoCode/);
  assert.doesNotMatch(updateFn, /promoCode/);
  assert.doesNotMatch(removeFn, /promoCode/);
  assert.match(src, /export async function repriceAndValidate/);
  assert.match(src, /pos_mutate_draft_line/);
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261230000700_journeys_atomic_rpcs.sql"), "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public.pos_mutate_draft_line/);
});

test("adding a line does not write a purchase or a discount", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 2 },
  });
  assert.equal(added.ok, true);
  assert.equal(store.order_lines.length, 1);
  assert.equal(store.order_lines[0].total_cents, 10000);
  assert.equal(store.orders[0].discount_cents, 0);
  assert.equal(store.orders[0].total_cents, 10000);
  assert.equal(store.orders[0].status, "draft");
  assert.equal(store.booking_transactions.length, 0);
});

test("promo attaches only on reprice, and needs a named buyer", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const refused = await repriceAndValidate(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    promoCode: "SAVE10",
  });
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.reason, "promo_needs_customer");

  store.orders[0].customer_id = "cust-1";
  let promoCalls = 0;
  const priced = await repriceAndValidate(
    fakeAdmin(store),
    { tenantId: "t1", orderId: created.orderId, promoCode: "SAVE10" },
    {
      resolvePromo: async () => {
        promoCalls += 1;
        return { ok: true, discountCents: 500, codeId: "promo-1" };
      },
    },
  );
  assert.equal(priced.ok, true);
  assert.equal(promoCalls, 1);
  assert.equal(store.orders[0].discount_cents, 500);
  assert.equal(store.orders[0].total_cents, 4500);
});

test("updateLine changes quantity from stored unit price, not a purchase", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const lineId = store.order_lines[0].id as string;
  const updated = await updateLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    lineId,
    units: 3,
  });
  assert.equal(updated.ok, true);
  assert.equal(store.order_lines[0].units, 3);
  assert.equal(store.orders[0].total_cents, 15000);
});

test("adding a line on another workspace's draft writes nothing", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t2", actorUserId: "u2" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(added.ok, false);
  if (added.ok) return;
  assert.equal(added.reason, "wrong_tenant");
  assert.equal(store.order_lines.length, 0);
});

test("a class on another workspace is not added to this sale", async () => {
  const store = makeStore();
  seedOffering(store);
  store.sessions.push({
    id: "ses-foreign",
    tenant_id: "t2",
    offering_id: "off-1",
    status: "scheduled",
    title: "Dawn",
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1, sessionId: "ses-foreign" },
  });
  assert.equal(added.ok, false);
  if (added.ok) return;
  assert.equal(added.reason, "wrong_tenant");
  assert.equal(store.order_lines.length, 0);
});

test("a walk-in class place stores the session on the line", async () => {
  const store = makeStore();
  seedOffering(store);
  store.sessions.push({
    id: "ses-1",
    tenant_id: "t1",
    offering_id: "off-1",
    status: "scheduled",
    title: "Dawn flow",
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1, sessionId: "ses-1" },
  });
  assert.equal(added.ok, true);
  assert.equal(store.order_lines[0].session_id, "ses-1");
  assert.match(String(store.order_lines[0].label), /Dawn flow/);
});

test("another workspace's catalog item is not added to this sale", async () => {
  const store = makeStore();
  seedOffering(store, { tenant_id: "t2" });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(added.ok, false);
  if (added.ok) return;
  assert.equal(added.reason, "invalid");
  assert.equal(store.order_lines.length, 0);
  assert.equal(store.orders[0].total_cents, 0);
});

test("pos_mutate_draft_line RPC conflict is not a silent overwrite", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  let rpcCalls = 0;
  const admin = fakeAdmin(store) as ReturnType<typeof fakeAdmin> & {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>;
  };
  admin.rpc = async (fn: string, args: Record<string, unknown>) => {
    assert.equal(fn, "pos_mutate_draft_line");
    rpcCalls += 1;
    const order = store.orders[0];
    if (Number(order.version) !== Number(args.p_expected_version)) {
      return { data: { ok: false, reason: "conflict" }, error: null };
    }
    order.version = Number(order.version) + 1;
    return { data: { ok: true, version: order.version }, error: null };
  };
  const first = await addLine(admin, {
    tenantId: "t1",
    orderId: created.orderId,
    expectedVersion: 1,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(first.ok, true);
  const second = await addLine(admin, {
    tenantId: "t1",
    orderId: created.orderId,
    expectedVersion: 1,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.reason, "conflict");
  assert.equal(rpcCalls, 1);
  assert.equal(store.orders[0].version, 2);
});

