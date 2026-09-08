import { test } from "node:test";
import assert from "node:assert/strict";
import { addLine, createDraftOrder } from "@/lib/pos/draft";
import { submitToPreparation } from "@/lib/pos/collection";
import {
  acknowledgeTicket,
  markTicketReady,
  recordHandoff,
  submitOrderToPreparation,
} from "./tickets";

type Row = Record<string, unknown>;

function makeStore() {
  return {
    orders: [] as Row[],
    order_lines: [] as Row[],
    talent_offerings: [] as Row[],
    talent_offering_variants: [] as Row[],
    booking_transactions: [] as Row[],
    preparation_tickets: [] as Row[],
    preparation_ticket_revisions: [] as Row[],
    visits: [] as Row[],
    spaces: [] as Row[],
  };
}

function fakeAdmin(store: ReturnType<typeof makeStore>) {
  const tables: Record<string, Row[]> = store;
  const from = (table: string) => {
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let inserted: Row[] = [];
    let patch: Row = {};
    const preds: Array<(row: Row) => boolean> = [];
    const match = () => (tables[table] ?? []).filter((row) => preds.every((p) => p(row)));
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
        preds.push((row) => row[k] === v);
        return api;
      },
      neq: (k: string, v: unknown) => {
        preds.push((row) => row[k] !== v);
        return api;
      },
      in: (k: string, vals: unknown[]) => {
        preds.push((row) => vals.includes(row[k]));
        return api;
      },
      order: () => api,
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

async function draftWithTaco(store: ReturnType<typeof makeStore>) {
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    title: "Taco",
    amount_cents: 1200,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("draft");
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 2 },
  });
  return created.orderId;
}

test("submitToPreparation creates a ticket and is no longer not_built", async () => {
  const store = makeStore();
  const orderId = await draftWithTaco(store);
  const r = await submitToPreparation(fakeAdmin(store), { tenantId: "t1", orderId });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.amended, false);
  assert.equal(r.revision, 1);
  assert.equal(store.preparation_tickets.length, 1);
  assert.equal(store.preparation_tickets[0].status, "queued");
  assert.equal(store.preparation_ticket_revisions.length, 1);
});

test("a later send amends the same ticket instead of duplicating it", async () => {
  const store = makeStore();
  const orderId = await draftWithTaco(store);
  const first = await submitOrderToPreparation(fakeAdmin(store), { tenantId: "t1", orderId, destination: "table" });
  assert.equal(first.ok, true);
  store.order_lines[0].units = 1;
  store.order_lines[0].label = "Taco, no onion";
  const second = await submitOrderToPreparation(fakeAdmin(store), { tenantId: "t1", orderId, destination: "table" });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.amended, true);
  assert.equal(second.revision, 2);
  assert.equal(store.preparation_tickets.length, 1);
  assert.equal(store.preparation_tickets[0].revision, 2);
  assert.equal(store.preparation_tickets[0].status, "queued");
  assert.equal(store.preparation_ticket_revisions.length, 2);
});

test("pickup destination is the same engine as table, not a second ticket type", async () => {
  const store = makeStore();
  const orderId = await draftWithTaco(store);
  const r = await submitOrderToPreparation(fakeAdmin(store), {
    tenantId: "t1",
    orderId,
    destination: "pickup",
    promisedAt: "2026-09-08T18:00:00.000Z",
  });
  assert.equal(r.ok, true);
  assert.equal(store.preparation_tickets[0].destination, "pickup");
  assert.equal(store.preparation_tickets[0].promised_at, "2026-09-08T18:00:00.000Z");
});

test("kitchen acknowledge, ready and takeaway handoff do not consult payment state", async () => {
  const store = makeStore();
  const orderId = await draftWithTaco(store);
  const sent = await submitOrderToPreparation(fakeAdmin(store), { tenantId: "t1", orderId, destination: "pickup" });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.equal(store.orders[0].status, "draft");
  const ack = await acknowledgeTicket(fakeAdmin(store), { tenantId: "t1", ticketId: sent.ticketId });
  assert.equal(ack.ok, true);
  const ready = await markTicketReady(fakeAdmin(store), { tenantId: "t1", ticketId: sent.ticketId });
  assert.equal(ready.ok, true);
  const handoff = await recordHandoff(fakeAdmin(store), { tenantId: "t1", ticketId: sent.ticketId });
  assert.equal(handoff.ok, true);
  assert.equal(store.preparation_tickets[0].status, "ready");
  assert.ok(store.preparation_tickets[0].handed_off_at);
  assert.equal(store.orders[0].status, "draft");
});

test("empty order cannot be sent to preparation", async () => {
  const store = makeStore();
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const r = await submitOrderToPreparation(fakeAdmin(store), { tenantId: "t1", orderId: created.orderId });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "empty");
  assert.equal(store.preparation_tickets.length, 0);
});
