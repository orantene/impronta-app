import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeAdmin, makeStore, type Row } from "@/lib/pos/__fixtures__/commands-store";
import { roleGrantsCapability } from "@/lib/access/roles";
import { cancelVisitNoCharge } from "./cancel-visit";

function seed(orders: Row[], payments: Row[] = []) {
  const store = makeStore();
  const tables = store as unknown as Record<string, Row[]>;
  store.visits.push({ id: "v1", tenant_id: "t1", space_id: "s1", joined_space_id: null, status: "open", version: 3 });
  tables.spaces = [{ id: "s1", tenant_id: "t1", needs_reset_at: null }];
  for (const o of orders) store.orders.push({ tenant_id: "t1", visit_id: "v1", version: 1, total_cents: 0, ...o });
  tables.booking_transactions = payments;
  return store;
}

test("an open visit with an unpaid check is cancelled: orders voided, visit closed, table needs reset", async () => {
  const store = seed([
    { id: "o1", status: "draft", total_cents: 9000 },
    { id: "o2", status: "pending_payment", total_cents: 6000 },
    { id: "o3", status: "cancelled", total_cents: 100 },
  ]);
  const r = await cancelVisitNoCharge(fakeAdmin(store), { tenantId: "t1", visitId: "v1", expectedVersion: 3 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.voidedOrders, 2);
  assert.deepEqual(store.orders.map((o) => o.status), ["cancelled", "cancelled", "cancelled"]);
  assert.equal(store.visits[0].status, "closed");
  assert.ok((store as unknown as Record<string, Row[]>).spaces[0].needs_reset_at, "the table reads needs reset, never a stale Free");
});

test("a visit with nothing ordered cancels cleanly", async () => {
  const store = seed([{ id: "o1", status: "draft", total_cents: 0 }]);
  const r = await cancelVisitNoCharge(fakeAdmin(store), { tenantId: "t1", visitId: "v1" });
  assert.equal(r.ok, true);
  assert.equal(store.visits[0].status, "closed");
});

test("a paid order refuses the cancel and changes nothing", async () => {
  const store = seed([
    { id: "o1", status: "draft", total_cents: 500 },
    { id: "o2", status: "paid", total_cents: 1000 },
  ]);
  const r = await cancelVisitNoCharge(fakeAdmin(store), { tenantId: "t1", visitId: "v1" });
  assert.deepEqual(r, { ok: false, reason: "has_payment" });
  assert.equal(store.orders[0].status, "draft");
  assert.equal(store.visits[0].status, "open");
});

test("a payment row (paid or requested) on an unpaid order refuses the cancel", async () => {
  for (const status of ["paid", "payment_requested"]) {
    const store = seed([{ id: "o1", status: "pending_payment", total_cents: 500 }], [{ id: "p1", order_id: "o1", status }]);
    const r = await cancelVisitNoCharge(fakeAdmin(store), { tenantId: "t1", visitId: "v1" });
    assert.deepEqual(r, { ok: false, reason: "has_payment" }, status);
    assert.equal(store.orders[0].status, "pending_payment");
    assert.equal(store.visits[0].status, "open");
  }
});

test("another workspace's visit, a closed visit and a stale version are refused", async () => {
  const other = seed([]);
  assert.deepEqual(await cancelVisitNoCharge(fakeAdmin(other), { tenantId: "t2", visitId: "v1" }), { ok: false, reason: "wrong_tenant" });
  const closed = seed([]);
  closed.visits[0].status = "closed";
  assert.deepEqual(await cancelVisitNoCharge(fakeAdmin(closed), { tenantId: "t1", visitId: "v1" }), { ok: false, reason: "already_closed" });
  const stale = seed([{ id: "o1", status: "draft", total_cents: 1 }]);
  assert.deepEqual(
    await cancelVisitNoCharge(fakeAdmin(stale), { tenantId: "t1", visitId: "v1", expectedVersion: 2 }),
    { ok: false, reason: "version_conflict" },
  );
  assert.equal(stale.orders[0].status, "draft");
});

test("the action is guarded by a named capability, audited, and a viewer or editor cannot hold it", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/tables/actions.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const body = src.slice(src.indexOf("export async function tablesCancelVisit"));
  const fn = body.slice(0, body.indexOf("export async function", 10));
  assert.match(fn, /await staff\("booking\.payment\.request"\)/);
  assert.match(fn, /auditEvent\(/);
  assert.match(fn, /pos\.visit\.cancelled_no_charge/);
  assert.match(src, /requireWorkspaceStaffAction\(capability \? \{ capability \} : undefined\)/);
  for (const role of ["viewer", "editor"] as const) assert.equal(roleGrantsCapability(role, "booking.payment.request"), false, role);
  for (const role of ["manager", "admin", "owner"] as const) assert.equal(roleGrantsCapability(role, "booking.payment.request"), true, role);
});

test("en and es copy exist for the cancel control and its refusal", () => {
  for (const lang of ["en", "es"]) {
    const t = JSON.parse(readFileSync(join(process.cwd(), `messages/${lang}.json`), "utf8")).dashboard.tables;
    for (const k of ["cancelVisit", "cancelVisitBody", "cancelVisitConfirm", "cancelVisitKeep"]) assert.ok(t[k], `${lang}.${k}`);
    assert.ok(t.refusal.hasPayment, `${lang}.refusal.hasPayment`);
    for (const k of ["cancelVisit", "cancelVisitBody", "cancelVisitConfirm", "cancelVisitKeep"]) assert.ok(!/\u2014/.test(t[k]));
  }
});
