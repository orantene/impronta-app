import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closeVisit, moveVisitToSpace, openTab, openVisit } from "./commands";
import { loadOpenVisitByToken, resolveOpenVisitForSpace } from "./qr";
import { listFloor } from "./floor";
import { addLine } from "@/lib/pos/draft";

type Row = Record<string, unknown>;

function makeStore() {
  return {
    spaces: [] as Row[],
    visits: [] as Row[],
    orders: [] as Row[],
    order_lines: [] as Row[],
    talent_offerings: [] as Row[],
    talent_offering_variants: [] as Row[],
    booking_transactions: [] as Row[],
    preparation_tickets: [] as Row[],
    preparation_ticket_revisions: [] as Row[],
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
      } else if (mode === "delete") {
        const keep = (tables[table] ?? []).filter((row) => !preds.every((p) => p(row)));
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

function seedSpace(store: ReturnType<typeof makeStore>, over: Partial<Row> = {}) {
  store.spaces.push({
    id: "space-t7",
    tenant_id: "t1",
    name: "Table 7",
    code: "t7",
    kind: "table",
    min_spend_cents: 0,
    status: "active",
    sort_order: 1,
    ...over,
  });
}

test("opening a visit creates occupancy and a draft order linked to the visit, not a check entity", async () => {
  const store = makeStore();
  seedSpace(store);
  const opened = await openVisit(fakeAdmin(store), {
    tenantId: "t1",
    spaceId: "space-t7",
    actorUserId: "u1",
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  assert.equal(store.visits.length, 1);
  assert.equal(store.visits[0].status, "open");
  assert.equal(store.visits[0].space_id, "space-t7");
  assert.equal(typeof store.visits[0].public_token, "string");
  assert.notEqual(store.visits[0].public_token, "space-t7");
  assert.equal(store.orders.length, 1);
  assert.equal(store.orders[0].visit_id, opened.visit.id);
  assert.equal(store.orders[0].space_id, "space-t7");
  assert.equal(store.orders[0].status, "draft");
});

test("a second open visit on the same space is refused", async () => {
  const store = makeStore();
  seedSpace(store);
  const first = await openVisit(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7", actorUserId: "u1" });
  assert.equal(first.ok, true);
  const second = await openVisit(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7", actorUserId: "u1" });
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.reason, "already_open");
  assert.equal(store.visits.filter((v) => v.status === "open").length, 1);
});

test("table QR returns the current visit token, never the table id", async () => {
  const store = makeStore();
  seedSpace(store);
  const opened = await openVisit(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7", actorUserId: "u1" });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const qr = await resolveOpenVisitForSpace(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7" });
  assert.equal(qr.ok, true);
  if (!qr.ok) return;
  assert.equal(qr.publicToken, opened.visit.publicToken);
  assert.equal(qr.path, `/visit/${opened.visit.publicToken}`);
  assert.doesNotMatch(qr.path, /space-t7/);
});

test("a closed visit is not reachable from the table QR or the old token", async () => {
  const store = makeStore();
  seedSpace(store);
  const opened = await openVisit(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7", actorUserId: "u1" });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const token = opened.visit.publicToken;
  const closed = await closeVisit(fakeAdmin(store), { tenantId: "t1", visitId: opened.visit.id });
  assert.equal(closed.ok, true);
  const qr = await resolveOpenVisitForSpace(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7" });
  assert.equal(qr.ok, false);
  if (qr.ok) return;
  assert.equal(qr.reason, "not_seated");
  const guest = await loadOpenVisitByToken(fakeAdmin(store), { tenantId: "t1", publicToken: token });
  assert.equal(guest.ok, false);
  if (guest.ok) return;
  assert.equal(guest.reason, "ended");
  const asSpace = await loadOpenVisitByToken(fakeAdmin(store), { tenantId: "t1", publicToken: "space-t7" });
  assert.equal(asSpace.ok, false);
});

test("closing a visit with an unpaid check is refused; empty check may reset", async () => {
  const store = makeStore();
  seedSpace(store);
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    title: "Taco",
    amount_cents: 1200,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
  });
  const opened = await openVisit(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7", actorUserId: "u1" });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: opened.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const refused = await closeVisit(fakeAdmin(store), { tenantId: "t1", visitId: opened.visit.id });
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.reason, "outstanding");

  store.orders[0].total_cents = 0;
  store.orders[0].status = "draft";
  const ok = await closeVisit(fakeAdmin(store), {
    tenantId: "t1",
    visitId: opened.visit.id,
    expectedVersion: opened.visit.version,
  });
  assert.equal(ok.ok, true);
});

test("a stale expectedVersion refuses close", async () => {
  const store = makeStore();
  seedSpace(store);
  const opened = await openVisit(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7", actorUserId: "u1" });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const stale = await closeVisit(fakeAdmin(store), {
    tenantId: "t1",
    visitId: opened.visit.id,
    expectedVersion: opened.visit.version + 9,
  });
  assert.equal(stale.ok, false);
  if (stale.ok) return;
  assert.equal(stale.reason, "version_conflict");
  assert.equal(store.visits[0].status, "open");
});

test("moving a visit changes the table, not a second check", async () => {
  const store = makeStore();
  seedSpace(store);
  seedSpace(store, { id: "space-t8", name: "Table 8", code: "t8", sort_order: 2 });
  const opened = await openVisit(fakeAdmin(store), { tenantId: "t1", spaceId: "space-t7", actorUserId: "u1" });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const moved = await moveVisitToSpace(fakeAdmin(store), {
    tenantId: "t1",
    visitId: opened.visit.id,
    spaceId: "space-t8",
  });
  assert.equal(moved.ok, true);
  assert.equal(store.visits.length, 1);
  assert.equal(store.visits[0].space_id, "space-t8");
  assert.equal(store.orders[0].space_id, "space-t8");
});

test("floor remaining minimum is policy, not a charge", async () => {
  const store = makeStore();
  seedSpace(store, { id: "cab-1", name: "Cabana 1", code: "c1", kind: "cabana", min_spend_cents: 50000 });
  const opened = await openVisit(fakeAdmin(store), { tenantId: "t1", spaceId: "cab-1", actorUserId: "u1" });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  store.orders[0].total_cents = 12000;
  const floor = await listFloor(fakeAdmin(store), "t1");
  assert.equal(floor.ok, true);
  if (!floor.ok) return;
  const cab = floor.tables.find((t) => t.spaceId === "cab-1");
  assert.ok(cab);
  assert.equal(cab?.remainingMinSpendCents, 38000);
});

test("opening a visit on another workspace's table writes nothing", async () => {
  const store = makeStore();
  seedSpace(store, { tenant_id: "t2" });
  const opened = await openVisit(fakeAdmin(store), {
    tenantId: "t1",
    spaceId: "space-t7",
    actorUserId: "u1",
  });
  assert.equal(opened.ok, false);
  if (opened.ok) return;
  assert.equal(opened.reason, "wrong_tenant");
  assert.equal(store.visits.length, 0);
  assert.equal(store.orders.length, 0);
});

test("another workspace cannot read this visit token, QR, or floor table", async () => {
  const store = makeStore();
  seedSpace(store);
  seedSpace(store, { id: "space-x", tenant_id: "t2", name: "Other", code: "x", sort_order: 9 });
  const opened = await openVisit(fakeAdmin(store), {
    tenantId: "t1",
    spaceId: "space-t7",
    actorUserId: "u1",
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const token = opened.visit.publicToken;

  const guest = await loadOpenVisitByToken(fakeAdmin(store), { tenantId: "t2", publicToken: token });
  assert.equal(guest.ok, false);
  if (guest.ok) return;
  assert.equal(guest.reason, "not_found");

  const qr = await resolveOpenVisitForSpace(fakeAdmin(store), { tenantId: "t2", spaceId: "space-t7" });
  assert.equal(qr.ok, false);
  if (qr.ok) return;
  assert.equal(qr.reason, "not_seated");

  const floor = await listFloor(fakeAdmin(store), "t1");
  assert.equal(floor.ok, true);
  if (!floor.ok) return;
  assert.deepEqual(
    floor.tables.map((t) => t.spaceId),
    ["space-t7"],
  );
});

test("guest visit page looks up public_token, not space_id", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/visits/qr.ts"), "utf8");
  assert.match(src, /public_token/);
  assert.match(src, /\/visit\/\$\{row\.public_token\}/);
  const page = readFileSync(join(process.cwd(), "src/app/visit/[token]/page.tsx"), "utf8");
  assert.match(page, /loadOpenVisitByToken/);
  assert.doesNotMatch(page, /eq\("space_id"/);
});

test("a bar tab is occupancy distinct from a table check", async () => {
  const store = makeStore();
  seedSpace(store);
  seedSpace(store, { id: "bar-rail", name: "Bar", code: "bar", kind: "bar" });
  const tab = await openTab(fakeAdmin(store), { tenantId: "t1", spaceId: "bar-rail", actorUserId: "u1" });
  assert.equal(tab.ok, true);
  if (!tab.ok) return;
  assert.equal(tab.visit.serviceKind, "tab");
  assert.equal(store.visits[0].service_kind, "tab");
  const table = await openVisit(fakeAdmin(store), {
    tenantId: "t1",
    spaceId: "space-t7",
    actorUserId: "u1",
  });
  assert.equal(table.ok, true);
  if (!table.ok) return;
  assert.equal(table.visit.serviceKind, "table");
});
