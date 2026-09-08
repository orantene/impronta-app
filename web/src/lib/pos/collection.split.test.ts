import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addLine, createDraftOrder } from "./draft";
import { startCollection } from "./collection";
import { settleAtDoor } from "@/lib/orders/settle-at-door";

type Row = Record<string, unknown>;

function makeStore() {
  return {
    orders: [] as Row[],
    order_lines: [] as Row[],
    talent_offerings: [] as Row[],
    talent_offering_variants: [] as Row[],
    booking_transactions: [] as Row[],
    agency_bookings: [] as Row[],
    capacity_allocations: [] as Row[],
    pos_shifts: [] as Row[],
    ticket_refund_intents: [] as Row[],
  };
}

function fakeAdmin(store: ReturnType<typeof makeStore>) {
  const tables: Record<string, Row[]> = store;
  const from = (table: string) => {
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let inserted: Row[] = [];
    let patch: Row = {};
    const eqs: Array<[string, unknown]> = [];
    const match = () =>
      (tables[table] ?? []).filter((row) =>
        eqs.every(([k, v]) => {
          if (v && typeof v === "object" && v !== null && "__neq" in v) {
            return row[k] !== (v as { __neq: unknown }).__neq;
          }
          if (v && typeof v === "object" && v !== null && "__in" in v) {
            return (v as { __in: unknown[] }).__in.includes(row[k]);
          }
          return row[k] === v;
        }),
      );
    const apply = () => {
      if (mode === "insert") {
        for (const r of inserted) {
          const row = { ...r, id: (r.id as string) ?? crypto.randomUUID() };
          (tables[table] ?? (tables[table] = [])).push(row);
          Object.assign(r, row);
        }
      } else if (mode === "update") {
        for (const row of match()) Object.assign(row, patch);
      } else if (mode === "delete") {
        const keep = (tables[table] ?? []).filter((row) => !eqs.every(([k, v]) => row[k] === v));
        tables[table] = keep;
        if (table in store) (store as Record<string, Row[]>)[table] = keep;
      }
    };
    const result = () => {
      apply();
      if (mode === "insert") return { data: inserted.length === 1 ? inserted[0] : inserted, error: null };
      return { data: match(), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (rows: Row | Row[]) => {
        mode = "insert";
        inserted = Array.isArray(rows) ? rows : [rows];
        return api;
      },
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return api;
      },
      delete: () => {
        mode = "delete";
        return api;
      },
      eq: (k: string, v: unknown) => {
        eqs.push([k, v]);
        return api;
      },
      neq: (k: string, v: unknown) => {
        eqs.push([k, { __neq: v }]);
        return api;
      },
      in: (k: string, vals: unknown[]) => {
        eqs.push([k, { __in: vals }]);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => {
        apply();
        const rows = match();
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        apply();
        if (mode === "insert") return { data: inserted[0] ?? null, error: inserted[0] ? null : { message: "none" } };
        const rows = match();
        return { data: rows[0] ?? null, error: rows[0] ? null : { message: "none" } };
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return api;
  };
  return { from };
}

function seedOffering(store: ReturnType<typeof makeStore>, over: Partial<Row> = {}) {
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    title: "Table for two",
    amount_cents: 9000,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
    ...over,
  });
}

const contact = { email: "split@example.com" };
const urls = { successUrl: "https://app.test/ok", cancelUrl: "https://app.test/no" };
const named = {
  ensureCustomer: async () => ({
    ok: true as const,
    customerId: "cust-split",
    created: true,
    identity: { email: "split@example.com", phoneE164: null, displayName: null },
  }),
};

async function openNineThousand() {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return store;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  return store;
}

test("three cash allocations on one order leave it unpaid until the third, then refuse a fourth", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const admin = fakeAdmin(store);
  const keys = ["pos-cash:a", "pos-cash:b", "pos-cash:c"];
  for (const [i, key] of keys.entries()) {
    const r = await startCollection(
      admin,
      {
        tenantId: "t1",
        orderId,
        actorUserId: "u1",
        method: "cash",
        contact,
        ...urls,
        amountCents: 3000,
        idempotencyKey: key,
      },
      { ...named, settle: settleAtDoor },
    );
    assert.equal(r.ok, true, `allocation ${i + 1}`);
    if (!r.ok) return;
    assert.equal(r.alreadySettled, false);
    assert.equal(r.amountCents, 3000);
    assert.equal(store.orders.length, 1);
    if (i < 2) {
      assert.equal(store.orders[0].status, "draft");
      assert.equal(r.outstandingAfterCents, 6000 - i * 3000);
    }
  }
  assert.equal(store.booking_transactions.filter((t) => t.status === "paid").length, 3);
  assert.equal(store.orders[0].status, "paid");
  const fourth = await startCollection(
    admin,
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "pos-cash:d",
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(fourth.ok, false);
  if (fourth.ok) return;
  assert.equal(fourth.reason, "not_draft");
  assert.equal(store.booking_transactions.filter((t) => t.status === "paid").length, 3);
  assert.equal(store.orders.length, 1);
});

test("equal splits use distinct idempotency keys and do not collide", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const first = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "pos-cash:same-amount:1",
    },
    { ...named, settle: settleAtDoor },
  );
  const second = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "pos-cash:same-amount:2",
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(store.booking_transactions.length, 2);
  assert.notEqual(
    store.booking_transactions[0].provider_reference,
    store.booking_transactions[1].provider_reference,
  );
});

test("the same cash idempotency key does not write a second allocation", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const input = {
    tenantId: "t1",
    orderId,
    actorUserId: "u1" as const,
    method: "cash" as const,
    contact,
    ...urls,
    amountCents: 3000,
    idempotencyKey: "pos-cash:retry",
  };
  const first = await startCollection(fakeAdmin(store), input, { ...named, settle: settleAtDoor });
  const second = await startCollection(fakeAdmin(store), input, { ...named, settle: settleAtDoor });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.alreadySettled, true);
  assert.equal(store.booking_transactions.length, 1);
});

test("an allocation larger than outstanding is refused", async () => {
  const store = await openNineThousand();
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 9001,
    },
    named,
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "amount");
  assert.equal(store.booking_transactions.length, 0);
});

test("tendered below the allocation is refused and does not write", async () => {
  const store = await openNineThousand();
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      tenderedCents: 2999,
    },
    named,
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "tendered");
  assert.equal(store.booking_transactions.length, 0);
});

test("change is tendered minus the allocation, not a second order", async () => {
  const store = await openNineThousand();
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      tenderedCents: 5000,
      idempotencyKey: "pos-cash:change",
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.changeCents, 2000);
  assert.equal(r.amountCents, 3000);
  assert.equal(store.orders.length, 1);
  assert.equal(store.orders[0].status, "draft");
  const meta = store.booking_transactions[0].metadata as { tendered_cents: number; change_cents: number };
  assert.equal(meta.tendered_cents, 5000);
  assert.equal(meta.change_cents, 2000);
  assert.equal(store.booking_transactions[0].gross_amount_cents, 3000);
});

test("split settlement does not introduce a check entity", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8");
  assert.doesNotMatch(src, /from\("checks"\)/);
  const settle = readFileSync(join(process.cwd(), "src/lib/orders/settle-at-door.ts"), "utf8");
  assert.match(settle, /shift_id/);
});
