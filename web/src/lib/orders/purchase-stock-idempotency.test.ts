/**
 * D5 (TUL-1268 item 4 + M7): stock is taken on EVERY sales path, and a repeated
 * submit never creates a second order.
 *
 * Driven through a small in-memory Supabase stand-in. Two properties are under
 * test, and both belong to the pipeline rather than to Postgres:
 *
 *   1. An offering with a stock pool (`talent_offerings.capacity_pool_id`) is
 *      reserved by `createPurchase` itself, even when the caller (menu, cart)
 *      declares no capacity. The fake `reserve_resource_set_v2` decrements one
 *      counter per call, the way `_capacity_reserve_locked` does under the
 *      pool's row lock, so two buyers racing for the last unit get one yes and
 *      one sold_out.
 *   2. `clientOrderKey` is stored on the order and checked: the same key twice
 *      (in sequence or at once) yields ONE order, and the second call gets the
 *      first order back. The fake enforces the held unique index
 *      `orders_tenant_client_order_key_uniq` the way Postgres would (23505), and
 *      can pretend the column does not exist yet (42703) to prove the code
 *      still works before the held migration is applied.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPurchase, type PurchaseInput } from "@/lib/orders/purchase";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OFFERING = "22222222-2222-2222-2222-222222222222";
const POOL = "33333333-3333-3333-3333-333333333333";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };
type Filter = { kind: "eq" | "in" | "is"; col: string; val: unknown };

type FakeOpts = {
  /** Units left in the offering's stock pool. */
  stock?: number;
  /** null = the offering has no pool (unlimited). */
  poolId?: string | null;
  /** false = the held migration is not applied: `orders.client_order_key` is missing. */
  keyColumn?: boolean;
  allowPayInPerson?: boolean;
};

function matches(row: Row, filters: readonly Filter[]): boolean {
  return filters.every((f) => {
    if (f.kind === "eq") return row[f.col] === f.val;
    if (f.kind === "in") return Array.isArray(f.val) && (f.val as unknown[]).includes(row[f.col]);
    return (row[f.col] ?? null) === f.val;
  });
}

function fakeDb(opts: FakeOpts = {}) {
  const keyColumn = opts.keyColumn ?? true;
  let stock = opts.stock ?? 1;
  const allocUnits = new Map<string, number>();
  const tables: Record<string, Row[]> = {
    orders: [],
    order_lines: [],
    booking_transactions: [],
    capacity_allocations: [],
    // `ensure_customer_for_tenant` below always answers cust_1; this is its row.
    customers: [{ id: "cust_1", tenant_id: TENANT, email: "guest@example.com" }],
  };
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const orderUpdates: Row[] = [];
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;

  const offeringRow: Row = {
    id: OFFERING,
    tenant_id: TENANT,
    title: "Tacos al pastor",
    status: "published",
    visibility: "public",
    moderation_state: "approved",
    price_type: "fixed",
    amount_cents: 5000,
    currency: "MXN",
    talent_profile_id: null,
    reserve_mode: "full",
    deposit_pct: null,
    allow_pay_in_person: opts.allowPayInPerson ?? false,
    require_account_to_book: false,
    cancellation_hours: null,
    kind: "product",
    duration_minutes: null,
    capacity_pool_id: opts.poolId === undefined ? POOL : opts.poolId,
  };

  const missingColumn = { code: "42703", message: "column orders.client_order_key does not exist" };

  const from = (table: string) => {
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row | Row[] | null = null;
    let inserted: Row[] = [];

    const run = (): Result => {
      const rows = tables[table];
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        if (table === "orders") {
          const p = list[0];
          if (!keyColumn && "client_order_key" in p) {
            return { data: null, error: { code: "PGRST204", message: "Could not find the 'client_order_key' column of 'orders'" } };
          }
          const key = p.client_order_key ?? null;
          if (key !== null && rows.some((r) => r.tenant_id === p.tenant_id && r.client_order_key === key && r.status !== "cancelled")) {
            return {
              data: null,
              error: { code: "23505", message: 'duplicate key value violates unique constraint "orders_tenant_client_order_key_uniq"' },
            };
          }
        }
        inserted = list.map((p) => ({ id: nextId(table), created_at: new Date().toISOString(), ...p }));
        if (rows) rows.push(...inserted);
        return { data: inserted, error: null };
      }
      if (op === "update") {
        if (table === "orders") orderUpdates.push(payload as Row);
        if (table === "orders" && !keyColumn && filters.some((f) => f.col === "client_order_key")) {
          return { data: null, error: missingColumn };
        }
        const hit = (rows ?? []).filter((r) => matches(r, filters));
        for (const r of hit) Object.assign(r, payload);
        return { data: hit, error: null };
      }
      if (table === "talent_offerings") return { data: [offeringRow], error: null };
      if (table === "capacity_pools") return { data: [{ id: POOL, tenant_id: TENANT, hold_ttl_seconds: 900 }], error: null };
      if (table === "orders" && !keyColumn && filters.some((f) => f.col === "client_order_key")) {
        return { data: null, error: missingColumn };
      }
      if (!rows) return { data: [], error: null };
      const hit = rows.filter((r) => matches(r, filters));
      // Like purchase-refusal.test.ts: line reads carry no seller columns, so
      // the commission attribution (not under test here) has nothing to do.
      if (table === "order_lines") {
        return { data: hit.map((r) => ({ id: r.id, order_id: r.order_id, offering_id: r.offering_id, sort_order: r.sort_order })), error: null };
      }
      return { data: hit, error: null };
    };

    const api = {
      select: () => api,
      insert: (p: Row | Row[]) => { op = "insert"; payload = p; return api; },
      update: (p: Row) => { op = "update"; payload = p; return api; },
      eq: (col: string, val: unknown) => { filters.push({ kind: "eq", col, val }); return api; },
      in: (col: string, val: unknown) => { filters.push({ kind: "in", col, val }); return api; },
      is: (col: string, val: unknown) => { filters.push({ kind: "is", col, val }); return api; },
      order: () => api,
      limit: () => api,
      neq: () => api,
      not: () => api,
      gte: () => api,
      lte: () => api,
      lt: () => api,
      gt: () => api,
      or: () => api,
      maybeSingle: async (): Promise<Result> => {
        if (table === "capacity_pools") return { data: { hold_ttl_seconds: 900, capacity_pool_id: null }, error: null };
        if (table === "talent_offerings") return { data: offeringRow, error: null };
        const r = run();
        if (r.error) return r;
        const list = (r.data as Row[]) ?? [];
        return { data: list[0] ?? null, error: null };
      },
      single: async (): Promise<Result> => {
        if (table === "customers") return { data: { id: "cust_1" }, error: null };
        const r = run();
        if (r.error) return r;
        const list = (r.data as Row[]) ?? [];
        return { data: list[0] ?? null, error: null };
      },
      then: (resolve: (v: Result) => unknown) => resolve(run()),
    };
    return api;
  };

  const rpc = async (fn: string, args?: Record<string, unknown>): Promise<Result> => {
    rpcCalls.push({ fn, args });
    // Yield first, so two purchases started together really do interleave here.
    await Promise.resolve();
    if (fn === "ensure_customer_for_tenant") return { data: "cust_1", error: null };
    if (fn === "reserve_resource_set_v2") {
      const legs = (args?.p_capacity ?? []) as Array<{ pool_id: string; units: number; order_line_id: string | null }>;
      const want = legs.filter((l) => l.pool_id === POOL).reduce((s, l) => s + l.units, 0);
      // The row-locked decrement: check and take in one step.
      if (want > stock) {
        return { data: { ok: false, reason: "sold_out", failed_pool_id: POOL, failed_talent_id: null }, error: null };
      }
      stock -= want;
      const ids = legs.map((l) => {
        const id = nextId("alloc");
        allocUnits.set(id, l.units);
        tables.capacity_allocations.push({ id, order_line_id: l.order_line_id, released_at: null });
        return id;
      });
      return { data: { ok: true, already: false, hold_ids: [], allocation_ids: ids, expires_at: null }, error: null };
    }
    if (fn === "release_capacity") {
      const ids = (args?.p_allocation_ids ?? []) as string[];
      for (const id of ids) {
        stock += allocUnits.get(id) ?? 0;
        allocUnits.delete(id);
        const row = tables.capacity_allocations.find((a) => a.id === id);
        if (row) row.released_at = new Date().toISOString();
      }
      return { data: { released: ids.length, already_released: 0 }, error: null };
    }
    if (fn === "commit_capacity") return { data: { ok: true, committed: 1 }, error: null };
    return { data: null, error: null };
  };

  return {
    // The pipeline types its client as SupabaseClient; this stand-in implements
    // only the calls it makes, so a new call site crashes instead of passing.
    admin: { from, rpc } as unknown as Parameters<typeof createPurchase>[0],
    tables,
    rpcCalls,
    orderUpdates,
    stockLeft: () => stock,
  };
}

function menuOrder(over: Partial<PurchaseInput> = {}): PurchaseInput {
  // The menu and cart shape: lines only, NO declared capacity.
  return {
    tenantId: TENANT,
    clientOrderKey: "menu:key-0001",
    actorUserId: null,
    contact: { email: "guest@example.com" },
    lines: [{ offeringId: OFFERING, units: 1 }],
    paymentChoice: "full",
    sourceChannel: "menu",
    ...over,
  };
}

const liveOrders = (t: Record<string, Row[]>) => t.orders.filter((o) => o.status !== "cancelled");

// ── 1. Stock is held on every path ───────────────────────────────────────────

test("two concurrent orders for the LAST unit: exactly one succeeds, the other is sold out", async () => {
  const db = fakeDb({ stock: 1 });
  const [a, b] = await Promise.all([
    createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:buyer-a" })),
    createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:buyer-b" })),
  ]);
  const oks = [a, b].filter((r) => r.ok);
  const refused = [a, b].filter((r) => !r.ok);
  assert.equal(oks.length, 1, `exactly one purchase may take the last unit, got ${JSON.stringify([a, b])}`);
  assert.equal(refused.length, 1);
  assert.equal(!refused[0].ok && refused[0].reason, "sold_out");
  assert.equal(db.stockLeft(), 0);
  // The loser's order is unwound, never left live.
  assert.equal(liveOrders(db.tables).length, 1);
});

test("a menu/cart line with a stock pool reserves it even though the caller declared no capacity", async () => {
  const db = fakeDb({ stock: 5 });
  const r = await createPurchase(db.admin, menuOrder({ lines: [{ offeringId: OFFERING, units: 2 }] }));
  assert.equal(r.ok, true);
  const reserve = db.rpcCalls.find((c) => c.fn === "reserve_resource_set_v2");
  assert.ok(reserve, "the stock pool must be reserved");
  const legs = (reserve.args as { p_capacity: Array<{ pool_id: string; units: number }> }).p_capacity;
  assert.deepEqual(legs.map((l) => [l.pool_id, l.units]), [[POOL, 2]]);
  assert.equal(db.stockLeft(), 3);
});

test("an offering with NO pool is unlimited: nothing is reserved", async () => {
  const db = fakeDb({ poolId: null });
  const r = await createPurchase(db.admin, menuOrder());
  assert.equal(r.ok, true);
  assert.equal(db.rpcCalls.find((c) => c.fn === "reserve_resource_set_v2"), undefined);
});

test("a caller that already declares the offering's capacity is not reserved twice", async () => {
  const db = fakeDb({ stock: 5 });
  const r = await createPurchase(
    db.admin,
    menuOrder({ capacity: [{ offeringId: OFFERING, poolId: POOL, units: 1 }] }),
  );
  assert.equal(r.ok, true);
  const reserve = db.rpcCalls.find((c) => c.fn === "reserve_resource_set_v2");
  assert.equal((reserve?.args as { p_capacity: unknown[] }).p_capacity.length, 1);
  assert.equal(db.stockLeft(), 4);
});

test("a pay-in-person stock order keeps its unit until the visit: committed, no 15-minute deadline", async () => {
  const db = fakeDb({ stock: 3, allowPayInPerson: true });
  const r = await createPurchase(db.admin, menuOrder({ paymentChoice: "in_person" }));
  assert.equal(r.ok, true);
  assert.ok(db.rpcCalls.find((c) => c.fn === "commit_capacity"), "the stock must be committed, not left as a lapsing hold");
  const statusPatch = db.orderUpdates.find((u) => u.status === "pending_payment");
  assert.ok(statusPatch);
  assert.equal(statusPatch.hold_expires_at, null, "the expiry sweep must not cancel a pay-in-person order");
});

test("a card stock order keeps the pool TTL so an abandoned checkout frees the unit", async () => {
  const db = fakeDb({ stock: 3 });
  const r = await createPurchase(db.admin, menuOrder());
  assert.equal(r.ok, true);
  assert.equal(db.rpcCalls.find((c) => c.fn === "commit_capacity"), undefined);
  const statusPatch = db.orderUpdates.find((u) => u.status === "pending_payment");
  assert.equal(typeof statusPatch?.hold_expires_at, "string");
});

// ── 2. The same clientOrderKey never makes a second order ────────────────────

test("same clientOrderKey twice in sequence: ONE order, the second call gets the first back", async () => {
  const db = fakeDb({ stock: 5 });
  const first = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:dbl-tap" }));
  const second = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:dbl-tap" }));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.ok && second.ok && second.orderId, first.ok && first.orderId);
  assert.equal(first.ok && second.ok && second.transactionId, first.ok && first.transactionId,
    "the replay hands back the same payment row, so Checkout reuses cs_txn_<id>");
  assert.equal(liveOrders(db.tables).length, 1);
  assert.equal(db.tables.booking_transactions.length, 1, "no second payment row");
  assert.equal(db.stockLeft(), 4, "the replay takes no second unit");
  assert.equal(db.tables.orders[0].client_order_key, "menu:dbl-tap", "the key is stored on the order");
});

test("same clientOrderKey twice AT ONCE: ONE order", async () => {
  const db = fakeDb({ stock: 5 });
  const [a, b] = await Promise.all([
    createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:race" })),
    createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:race" })),
  ]);
  assert.equal(a.ok && b.ok, true, `both calls answer ok, got ${JSON.stringify([a, b])}`);
  assert.equal(a.ok && b.ok && a.orderId === b.orderId, true);
  assert.equal(liveOrders(db.tables).length, 1);
  assert.equal(db.tables.booking_transactions.length, 1);
  assert.equal(db.stockLeft(), 4);
});

test("a key whose first order was cancelled (refused, unwound) may be used again", async () => {
  const db = fakeDb({ stock: 0 });
  const first = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:retry" }));
  assert.equal(!first.ok && first.reason, "sold_out");
  // The same intent retries with the same key.
  const again = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:retry" }));
  // Still sold out, but it RAN: a refusal is not replayed as a success.
  assert.equal(!again.ok && again.reason, "sold_out");
  assert.equal(db.rpcCalls.filter((c) => c.fn === "reserve_resource_set_v2").length, 2);
});

test("same key with a DIFFERENT email gets no order and no Checkout back", async () => {
  const db = fakeDb({ stock: 5 });
  const first = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:shared-key" }));
  assert.equal(first.ok, true);
  const other = await createPurchase(
    db.admin,
    menuOrder({ clientOrderKey: "menu:shared-key", contact: { email: "someone-else@example.com" } }),
  );
  assert.equal(other.ok, false, `a stranger must not receive the first order, got ${JSON.stringify(other)}`);
  assert.equal(!other.ok && other.reason, "engine_error");
  assert.equal(JSON.stringify(other).includes(first.ok ? first.orderId : "-"), false, "no order id leaks");
  assert.equal(liveOrders(db.tables).length, 1, "and no second order is made under that key");
  assert.equal(db.tables.booking_transactions.length, 1);
});

test("same key with the SAME email (any case) gets the first order back", async () => {
  const db = fakeDb({ stock: 5 });
  const first = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:same-buyer" }));
  const again = await createPurchase(
    db.admin,
    menuOrder({ clientOrderKey: "menu:same-buyer", contact: { email: "Guest@Example.com" } }),
  );
  assert.equal(first.ok && again.ok && again.orderId === first.orderId, true, JSON.stringify(again));
});

test("different keys are different orders", async () => {
  const db = fakeDb({ stock: 5 });
  const a = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:one" }));
  const b = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:two" }));
  assert.equal(a.ok && b.ok && a.orderId !== b.orderId, true);
  assert.equal(liveOrders(db.tables).length, 2);
});

test("BEFORE the held migration (no client_order_key column) purchases still work", async () => {
  const db = fakeDb({ stock: 5, keyColumn: false });
  const r = await createPurchase(db.admin, menuOrder({ clientOrderKey: "menu:premigration" }));
  assert.equal(r.ok, true, `purchase must not depend on the held column, got ${JSON.stringify(r)}`);
  assert.equal("client_order_key" in db.tables.orders[0], false, "the key is not written to a missing column");
});
