import { test } from "node:test";
import assert from "node:assert/strict";
import { approveDeliverable, createDeliverable, requestRevision, submitDeliverable } from "./deliverables";

type Row = Record<string, unknown>;

function fake(store: { booking_deliverables: Row[] }) {
  const from = (table: string) => {
    let mode: "select" | "insert" | "update" = "select";
    let inserted: Row[] = [];
    let patch: Row = {};
    const eqs: Array<[string, unknown]> = [];
    const match = () => (store[table as keyof typeof store] ?? []).filter((row) => eqs.every(([k, v]) => row[k] === v));
    const apply = () => {
      if (mode === "insert") {
        for (const r of inserted) {
          const row = { ...r, id: (r.id as string) ?? crypto.randomUUID() };
          store.booking_deliverables.push(row);
          Object.assign(r, row);
        }
      } else if (mode === "update") {
        for (const row of match()) Object.assign(row, patch);
      }
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
      maybeSingle: async () => {
        apply();
        return { data: match()[0] ?? null, error: null };
      },
      single: async () => {
        apply();
        return { data: inserted[0] ?? match()[0] ?? null, error: null };
      },
    };
    return api;
  };
  return { from };
}

test("a client approval and a limited revision round live on the booking, not a new invoice", async () => {
  const store = { booking_deliverables: [] as Row[] };
  const created = await createDeliverable(fake(store), {
    tenantId: "t1",
    bookingId: "b1",
    title: "September reel",
    revisionLimit: 1,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const submitted = await submitDeliverable(fake(store), { tenantId: "t1", deliverableId: created.deliverable.id });
  assert.equal(submitted.ok, true);
  const revised = await requestRevision(fake(store), { tenantId: "t1", deliverableId: created.deliverable.id });
  assert.equal(revised.ok, true);
  if (!revised.ok) return;
  assert.equal(revised.deliverable.revision, 1);
  const again = await submitDeliverable(fake(store), { tenantId: "t1", deliverableId: created.deliverable.id });
  assert.equal(again.ok, true);
  const blocked = await requestRevision(fake(store), { tenantId: "t1", deliverableId: created.deliverable.id });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.reason, "limit_reached");
  const approved = await approveDeliverable(fake(store), { tenantId: "t1", deliverableId: created.deliverable.id });
  assert.equal(approved.ok, true);
});

test("passthrough advertising funds are not a service deliverable", async () => {
  const store = { booking_deliverables: [] as Row[] };
  const created = await createDeliverable(fake(store), {
    tenantId: "t1",
    bookingId: "b1",
    title: "Meta ads August",
    kind: "passthrough_budget",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.deliverable.kind, "passthrough_budget");
  assert.notEqual(created.deliverable.kind, "service");
});
