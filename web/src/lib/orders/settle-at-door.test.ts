import { test } from "node:test";
import assert from "node:assert/strict";
import { settleAtDoor } from "./settle-at-door";

type Row = Record<string, unknown>;

function fake(opts: {
  order?: Row | null;
  existingTxn?: { id: string } | null;
  insertId?: string;
}) {
  const inserts: Row[] = [];
  const from = (table: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      insert: (payload: Row) => {
        inserts.push({ table, ...payload });
        return api;
      },
      maybeSingle: async () => {
        if (table === "orders") return { data: opts.order ?? null, error: null };
        if (table === "booking_transactions") return { data: opts.existingTxn ?? null, error: null };
        return { data: null, error: null };
      },
      single: async () => ({ data: { id: opts.insertId ?? "txn-new" }, error: null }),
    };
    return api;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { inserts, admin: { from, rpc: async () => ({ data: null, error: null }) } as any };
}

test("refuses a negative amount before any write", async () => {
  const { inserts, admin } = fake({ order: { id: "o1", tenant_id: "t1", status: "pending_payment", total_cents: 1000 } });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "o1", actorUserId: "u1", paidVia: "cash",
    amountCents: -1, currency: "usd", idempotencyKey: "door-1",
  });
  assert.equal(!r.ok && r.reason, "amount");
  assert.equal(inserts.length, 0);
});

test("refuses another workspace's order", async () => {
  const { admin } = fake({ order: { id: "o1", tenant_id: "other", status: "pending_payment", total_cents: 1000 } });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "o1", actorUserId: "u1", paidVia: "cash",
    amountCents: 1000, currency: "usd", idempotencyKey: "door-1",
  });
  assert.equal(!r.ok && r.reason, "wrong_tenant");
});

test("a missing order is not_found, not a write", async () => {
  const { admin } = fake({ order: null });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "missing", actorUserId: "u1", paidVia: "card",
    amountCents: 1000, currency: "usd", idempotencyKey: "door-1",
  });
  assert.equal(!r.ok && r.reason, "not_found");
});
