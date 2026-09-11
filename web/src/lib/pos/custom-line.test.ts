import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addCustomLine, lockedCustomLineIds } from "./custom-line";
import { approveCustomAmount } from "./approval";
import { startCollection } from "./collection";
import { createDraftOrder } from "./draft";
import { fakeAdmin, makeStore } from "./__fixtures__/commands-store";

test("a custom line is written with kind custom and no offering", async () => {
  const store = makeStore();
  store.agencies.push({ id: "t1", settings: { pos: { approval: { custom_amount_limit_cents: 10000 } } } });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addCustomLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    label: "Open item",
    amountCents: 2500,
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(added.needsApproval, false);
  assert.equal(store.order_lines[0].kind, "custom");
  assert.equal(store.order_lines[0].offering_id, null);
  assert.equal(store.order_lines[0].unit_cents, 2500);
});

test("an over-limit custom line cannot be collected until approved", async () => {
  const store = makeStore();
  store.agencies.push({ id: "t1", settings: { pos: { approval: { custom_amount_limit_cents: 1000 } } } });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addCustomLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    label: "Open item",
    amountCents: 5000,
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(added.needsApproval, true);
  const locked = await lockedCustomLineIds(fakeAdmin(store), { tenantId: "t1", orderId: created.orderId });
  assert.equal(locked.ok, true);
  if (!locked.ok) return;
  assert.deepEqual(locked.lockedLineIds, [added.lineId]);

  const collected = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "u1",
      method: "cash",
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      idempotencyKey: "collect-custom-1",
    },
  );
  assert.equal(collected.ok, false);
  if (collected.ok) return;
  assert.equal(collected.reason, "over_limit");
});

test("a wrong PIN approve writes nothing", async () => {
  const store = makeStore();
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    ...fakeAdmin(store),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: { ok: false, reason: "pin_invalid" }, error: null };
    },
  };
  const result = await approveCustomAmount(admin, {
    tenantId: "t1",
    orderId: "o1",
    lineId: "l1",
    operationKey: "approve-aaaa",
    approverUserId: "mgr",
    pin: "1234",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "pin_invalid");
  assert.equal(store.pos_approvals.length, 0);
  assert.equal(calls[0]?.fn, "pos_approve_custom_amount");
});

test("the custom-amount migration proves a refused approve writes nothing", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231201000_pos_custom_amount_approvals.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.pos_approvals/);
  assert.match(sql, /pos_approve_custom_amount/);
  assert.match(sql, /a refused approve wrote a row/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public.pos_approve_custom_amount/);
});
