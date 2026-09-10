import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addLine, createDraftOrder } from "./draft";
import { startCollection } from "./collection";
import { closeShift, currentShift, openShift } from "./shift";
import { settleAtDoor } from "@/lib/orders/settle-at-door";
import { makeCollectionRpc } from "./__fixtures__/collection-reservations";

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
    order_collection_reservations: [] as Row[],
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
      eq: (k: string, v: unknown) => {
        eqs.push([k, v]);
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

/**
 * The same store, plus the collection RPCs. `startCollection` refuses rather
 * than collect without `pos_reserve_collection`; the draft commands keep their
 * PostgREST fallback, so only the till needs them.
 */
function fakeTill(store: ReturnType<typeof makeStore>) {
  return { from: fakeAdmin(store).from, rpc: makeCollectionRpc(store) };
}

test("one open shift per tenant; a second open is refused", async () => {
  const store = makeStore();
  const first = await openShift(fakeAdmin(store), {
    tenantId: "t1",
    actorUserId: "u1",
    openingCashCents: 5000,
  });
  assert.equal(first.ok, true);
  const second = await openShift(fakeAdmin(store), {
    tenantId: "t1",
    actorUserId: "u2",
    openingCashCents: 0,
  });
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.reason, "already_open");
  assert.equal(store.pos_shifts.filter((s) => s.status === "open").length, 1);
});

test("an open shift on another workspace does not block or close this drawer", async () => {
  const store = makeStore();
  const other = await openShift(fakeAdmin(store), {
    tenantId: "t2",
    actorUserId: "u2",
    openingCashCents: 1000,
  });
  assert.equal(other.ok, true);
  const mine = await openShift(fakeAdmin(store), {
    tenantId: "t1",
    actorUserId: "u1",
    openingCashCents: 5000,
  });
  assert.equal(mine.ok, true);
  if (!mine.ok) return;
  const seen = await currentShift(fakeAdmin(store), { tenantId: "t1" });
  assert.equal(seen.ok, true);
  if (!seen.ok) return;
  assert.equal(seen.shift?.id, mine.shift.id);
  const closed = await closeShift(fakeAdmin(store), {
    tenantId: "t1",
    actorUserId: "u1",
    closingCashCents: 5000,
  });
  assert.equal(closed.ok, true);
  assert.equal(store.pos_shifts.find((s) => s.tenant_id === "t2")?.status, "open");
});

test("cash still collects when no shift is open", async () => {
  const store = makeStore();
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    title: "Coffee",
    amount_cents: 400,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const none = await currentShift(fakeAdmin(store), { tenantId: "t1" });
  assert.equal(none.ok, true);
  if (none.ok) assert.equal(none.shift, null);
  const r = await startCollection(
    fakeTill(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "u1",
      method: "cash",
      contact: { email: "walkin@example.com" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      idempotencyKey: "pos-cash:noshift",
    },
    {
      ensureCustomer: async () => ({
        ok: true,
        customerId: "cust-1",
        created: true,
        identity: { email: "walkin@example.com", phoneE164: null, displayName: null },
      }),
      settle: settleAtDoor,
    },
  );
  assert.equal(r.ok, true);
  const meta = store.booking_transactions[0].metadata as { shift_id?: string };
  assert.equal(meta.shift_id, undefined);
});

test("closing a shift totals opening plus cash allocations, not tendered", async () => {
  const store = makeStore();
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    title: "Lunch",
    amount_cents: 3000,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
  });
  const opened = await openShift(fakeAdmin(store), {
    tenantId: "t1",
    actorUserId: "u1",
    openingCashCents: 1000,
  });
  assert.equal(opened.ok, true);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const collected = await startCollection(
    fakeTill(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "u1",
      method: "cash",
      contact: { email: "walkin@example.com" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      amountCents: 3000,
      tenderedCents: 5000,
      idempotencyKey: "pos-cash:shift",
    },
    {
      ensureCustomer: async () => ({
        ok: true,
        customerId: "cust-1",
        created: true,
        identity: { email: "walkin@example.com", phoneE164: null, displayName: null },
      }),
      settle: settleAtDoor,
    },
  );
  assert.equal(collected.ok, true);
  const closed = await closeShift(fakeAdmin(store), {
    tenantId: "t1",
    actorUserId: "u1",
    closingCashCents: 4000,
    expectedVersion: 1,
  });
  assert.equal(closed.ok, true);
  if (!closed.ok) return;
  assert.equal(closed.shift.expectedCashCents, 4000);
  assert.equal(closed.shift.closingCashCents, 4000);
  assert.equal(closed.shift.varianceCents, 0);
  assert.equal(store.pos_shifts[0].status, "closed");
  const after = await currentShift(fakeAdmin(store), { tenantId: "t1" });
  assert.equal(after.ok, true);
  if (after.ok) assert.equal(after.shift, null);
});

test("POS client does not close a shift on unmount or navigation", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/pos-client.tsx"),
    "utf8",
  );
  // THE RULE: the till has no effects, so no lifecycle event can ever reach
  // `closeShift`. A shift closed by a navigation is a cash-up nobody counted.
  //
  // Matched on the CALL, over comment-stripped source. The raw-substring form
  // this replaces was satisfied by the counter's own header explaining why it
  // runs no effects — a guard a comment can turn red is a guard a comment can
  // also turn green, and the intent is unchanged either way.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /useEffect\s*\(/);
  assert.match(src, /posCloseShift/);
  assert.match(src, /posOpenShift/);
  const page = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx"),
    "utf8",
  );
  assert.match(page, /currentShift/);
  assert.doesNotMatch(page, /closeShift/);
});
