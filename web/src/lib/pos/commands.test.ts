import { test } from "node:test";
import assert from "node:assert/strict";
import { POS_COMMANDS, isPosCommand, posGuestSessionId } from "./commands";
import { addLine, createDraftOrder, repriceAndValidate, updateLine } from "./draft";
import { finalizeOrCancel, startCollection, submitToPreparation } from "./collection";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, unknown>;

function makeStore() {
  return {
    orders: [] as Row[],
    order_lines: [] as Row[],
    talent_offerings: [] as Row[],
    talent_offering_variants: [] as Row[],
    booking_transactions: [] as Row[],
    agency_bookings: [] as Row[],
    preparation_tickets: [] as Row[],
    preparation_ticket_revisions: [] as Row[],
    visits: [] as Row[],
    spaces: [] as Row[],
    sessions: [] as Row[],
    capacity_allocations: [] as Row[],
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
        const before = match();
        apply();
        if (mode === "update") return { data: before[0] ?? null, error: null };
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
    title: "Gel manicure",
    amount_cents: 5000,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
    ...over,
  });
}

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

test("collect refuses without contact when the draft has no customer", async () => {
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
  const r = await startCollection(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    actorUserId: "u1",
    method: "cash",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "no_contact");
  assert.equal(store.booking_transactions.length, 0);
});

test("submitToPreparation writes a ticket instead of returning not_built", async () => {
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
  const r = await submitToPreparation(fakeAdmin(store), { tenantId: "t1", orderId: created.orderId });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.revision, 1);
  assert.equal(store.preparation_tickets.length, 1);
});

test("POS actions do not call createPurchase", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/actions.ts"), "utf8");
  assert.doesNotMatch(src, /createPurchase/);
  const collection = readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8");
  assert.match(collection, /holdDraftOrderCapacity/);
  assert.doesNotMatch(collection, /createPurchase/);
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

test("cash collection with contact records a settle, not a purchase", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const orderId = created.orderId;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  let settled = 0;
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact: { email: "walkin@example.com" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
    },
    {
      ensureCustomer: async () => ({
        ok: true,
        customerId: "cust-walkin",
        created: true,
        identity: { email: "walkin@example.com", phoneE164: null, displayName: null },
      }),
      settle: async () => {
        settled += 1;
        return { ok: true, orderId, transactionId: "txn-cash", alreadySettled: false };
      },
    },
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.method, "cash");
  assert.equal(settled, 1);
  assert.equal(store.orders[0].customer_id, "cust-walkin");
});

test("collect refuses when the class place is sold out and does not settle", async () => {
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
  let settled = 0;
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "u1",
      method: "cash",
      contact: { email: "walkin@example.com" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
    },
    {
      ensureCustomer: async () => ({
        ok: true,
        customerId: "cust-walkin",
        created: true,
        identity: { email: "walkin@example.com", phoneE164: null, displayName: null },
      }),
      settle: async () => {
        settled += 1;
        return { ok: true, orderId: created.orderId, transactionId: "txn-cash", alreadySettled: false };
      },
      holdCapacity: async () => ({ ok: false, reason: "sold_out", error: "That is no longer free." }),
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "sold_out");
  assert.equal(settled, 0);
});

test("cancelling a draft releases held class places", async () => {
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
  const lineId = String(store.order_lines[0].id);
  store.capacity_allocations.push({
    id: "alloc-1",
    tenant_id: "t1",
    order_line_id: lineId,
    released_at: null,
  });
  store.capacity_allocations.push({
    id: "alloc-foreign",
    tenant_id: "t2",
    order_line_id: lineId,
    released_at: null,
  });
  const released: string[] = [];
  const r = await finalizeOrCancel(
    fakeAdmin(store),
    { tenantId: "t1", orderId: created.orderId },
    {
      release: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
    },
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.status, "cancelled");
  assert.deepEqual(released, ["alloc-1"]);
  assert.equal(store.orders[0].status, "cancelled");
});

test("cancelling another workspace's sale writes nothing", async () => {
  const store = makeStore();
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t2", actorUserId: "u2" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  store.capacity_allocations.push({
    id: "alloc-2",
    tenant_id: "t2",
    order_line_id: "line-x",
    released_at: null,
  });
  let released = 0;
  const r = await finalizeOrCancel(
    fakeAdmin(store),
    { tenantId: "t1", orderId: created.orderId },
    {
      release: async () => {
        released += 1;
        return { ok: true, released: 1, alreadyReleased: 0 };
      },
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "wrong_tenant");
  assert.equal(released, 0);
  assert.equal(store.orders[0].status, "draft");
});

test("two operators writing the same expectedVersion conflict", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const first = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    expectedVersion: 1,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(first.ok, true);
  const second = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    expectedVersion: 1,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.reason, "conflict");
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

test("cancelling a draft whose allocation read fails is not a successful release", async () => {
  const store = makeStore();
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  store.order_lines.push({ id: "line-1", order_id: created.orderId, tenant_id: "t1" });
  const admin = fakeAdmin(store);
  const origFrom = admin.from;
  admin.from = (table: string) => {
    const api = origFrom(table) as Record<string, unknown> & {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => unknown;
    };
    if (table === "capacity_allocations") {
      api.then = (resolve) =>
        Promise.resolve({ data: null, error: { message: "read failed" } }).then(resolve);
    }
    return api;
  };
  let released = 0;
  const r = await finalizeOrCancel(
    admin,
    { tenantId: "t1", orderId: created.orderId },
    {
      release: async () => {
        released += 1;
        return { ok: true, released: 1, alreadyReleased: 0 };
      },
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "unavailable");
  assert.equal(released, 0);
});

test("zero-total collect does not fabricate a charge", async () => {
  const store = makeStore();
  seedOffering(store, { amount_cents: 0 });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  let paidHook = 0;
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "u1",
      method: "cash",
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
    },
    {
      holdCapacity: async () => ({ ok: true, allocationIds: [], holdIds: [], skipped: true }),
      onOrderPaid: async () => {
        paidHook += 1;
      },
    },
  );
  assert.equal(r.ok, true);
  assert.equal(store.booking_transactions.length, 0);
  assert.equal(store.orders[0].status, "paid");
  assert.equal(paidHook, 1);
  assert.equal(
    store.booking_transactions.some((row) => String(row.id).includes("zero-collect")),
    false,
  );
});
