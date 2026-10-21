import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { applyPosCollectiveSplit } from "./collective-split-apply";

type Row = Record<string, unknown>;

/** A tiny in-memory PostgREST: select/eq/in/neq chains over tables, update().eq() recorded. */
function fakeAdmin(tables: Record<string, Row[]>, opts: { failUpdate?: boolean } = {}) {
  const reads: string[] = [];
  const updates: Array<{ table: string; id: unknown; patch: Row }> = [];
  const admin = {
    from(table: string) {
      reads.push(table);
      let rows = tables[table] ?? [];
      let patch: Row | null = null;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        update: (p: Row) => ((patch = p), q),
        eq: (c: string, v: unknown) => {
          if (patch) {
            updates.push({ table, id: v, patch });
            return Promise.resolve({ error: opts.failUpdate ? { message: "x" } : null });
          }
          rows = rows.filter((r) => r[c] === v);
          return q;
        },
        limit: (n: number) => ((rows = rows.slice(0, n)), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      });
      return q;
    },
  };
  return { admin: admin as never, reads, updates };
}

const world = (over: { model?: string | null } = {}): Record<string, Row[]> => ({
  orders: [{ id: "o1", tenant_id: "t1", currency: "MXN" }],
  agencies: [{ id: "t1", work_model: over.model === undefined ? "friends_collective" : over.model }],
  order_lines: [
    { id: "l1", order_id: "o1", tenant_id: "t1", kind: "catalog", talent_profile_id: "a", total_cents: 10_000, talent_cost_cents: 10_000, label: "Gel manicure", owner_share_snapshot: null },
    { id: "l2", order_id: "o1", tenant_id: "t1", kind: "custom", talent_profile_id: null, total_cents: 5_000, talent_cost_cents: 0, label: "Custom", owner_share_snapshot: null },
  ],
  agency_talent_roster: [{ tenant_id: "t1", talent_profile_id: "a", status: "active", owner_share_kind: "percent", owner_share_bps: 2500, owner_share_version: 2 }],
  talent_profiles: [{ id: "a", display_name: "Ana" }],
});

const prev = process.env.COLLECTIVE_SPLIT_ENABLED;
beforeEach(() => { process.env.COLLECTIVE_SPLIT_ENABLED = "1"; });
afterEach(() => { if (prev === undefined) delete process.env.COLLECTIVE_SPLIT_ENABLED; else process.env.COLLECTIVE_SPLIT_ENABLED = prev; });

describe("POS counter sales split like online ones (TUL-1467)", () => {
  test("flag OFF: nothing is read, nothing changes (every counter sale in every workspace)", async () => {
    delete process.env.COLLECTIVE_SPLIT_ENABLED;
    const w = fakeAdmin(world());
    assert.deepEqual(await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" }), { ok: true, changed: 0 });
    assert.deepEqual(w.reads, []);
  });

  test("not a collective: no line is touched", async () => {
    const w = fakeAdmin(world({ model: "coordinator_agency" }));
    assert.deepEqual(await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" }), { ok: true, changed: 0 });
    assert.equal(w.updates.length, 0);
  });

  test("a collective: the member line carries the owner's take and her net; the custom line is untouched", async () => {
    const w = fakeAdmin(world());
    const r = await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" });
    assert.deepEqual(r, { ok: true, changed: 1 });
    assert.equal(w.updates.length, 1);
    const u = w.updates[0];
    assert.equal(u.id, "l1");
    assert.equal(u.patch.talent_cost_cents, 7_500);
    assert.equal(u.patch.owner_take_cents, 2_500);
    assert.deepEqual(u.patch.owner_share_snapshot, { kind: "percent", bps: 2500, version: 2 });
    assert.equal(u.patch.label, "Gel manicure · Ana");
  });

  test("running again (a retried collection) changes nothing: a line already exactly split is left alone", async () => {
    const t = world();
    Object.assign(t.order_lines[0] as Row, { owner_share_snapshot: { kind: "percent", bps: 2500, version: 2 }, talent_cost_cents: 7_500, owner_take_cents: 2_500, label: "Gel manicure · Ana" });
    const w = fakeAdmin(t);
    assert.deepEqual(await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" }), { ok: true, changed: 0 });
    assert.equal(w.updates.length, 0);
  });

  test("a quantity change after an earlier split is RE-split from the new total (the frozen snapshot does not go stale)", async () => {
    const t = world();
    Object.assign(t.order_lines[0] as Row, { owner_share_snapshot: { kind: "percent", bps: 2500, version: 2 }, talent_cost_cents: 7_500, owner_take_cents: 2_500, label: "Gel manicure · Ana", total_cents: 20_000 });
    const w = fakeAdmin(t);
    assert.deepEqual(await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" }), { ok: true, changed: 1 });
    assert.equal(w.updates[0].patch.talent_cost_cents, 15_000);
    assert.equal(w.updates[0].patch.owner_take_cents, 5_000);
  });

  test("a member who no longer has an accepted share: the frozen split is cleared back to the POS convention", async () => {
    const t = world();
    Object.assign(t.order_lines[0] as Row, { owner_share_snapshot: { kind: "percent", bps: 2500, version: 2 }, talent_cost_cents: 7_500, owner_take_cents: 2_500, unit_cents: 10_000 });
    t.agency_talent_roster = [{ tenant_id: "t1", talent_profile_id: "a", status: "active", owner_share_kind: null, owner_share_version: 2 }];
    const w = fakeAdmin(t);
    assert.deepEqual(await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" }), { ok: true, changed: 1 });
    assert.deepEqual(w.updates[0].patch, { talent_cost_cents: 10_000, owner_take_cents: null, owner_share_snapshot: null });
  });

  test("TUL-1703: a workspace that is not a collective never reads the split columns (a database without them still collects)", async () => {
    const w = fakeAdmin(world({ model: "coordinator_agency" }));
    assert.deepEqual(await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" }), { ok: true, changed: 0 });
    assert.ok(!w.reads.includes("order_lines"), "order_lines (with owner_share_snapshot) is not touched");
    assert.ok(!w.reads.includes("agency_talent_roster"));
  });

  test("TUL-1703 split tender: once a payment is taken or in flight the split is frozen (no re-split, no write)", async () => {
    for (const status of ["payment_requested", "paid"]) {
      const t = world();
      t.booking_transactions = [{ id: "x1", order_id: "o1", source_tenant_id: "t1", status }];
      const w = fakeAdmin(t);
      assert.deepEqual(await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" }), { ok: true, changed: 0 }, status);
      assert.equal(w.updates.length, 0);
    }
  });

  test("TUL-1703: a draft (not yet paid) transaction does not freeze it; the sale is split normally", async () => {
    const t = world();
    t.booking_transactions = [{ id: "x1", order_id: "o1", source_tenant_id: "t1", status: "draft" }];
    const w = fakeAdmin(t);
    assert.deepEqual(await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" }), { ok: true, changed: 1 });
  });

  test("TUL-1703: a failed read of the payments refuses the collection (never splits blind)", async () => {
    const t = world();
    const w = fakeAdmin({ ...t, booking_transactions: undefined as never });
    const failing = { from: (tb: string) => (tb === "booking_transactions" ? ({ select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ limit: async () => ({ data: null, error: { message: "x" } }) }) }) }) }) }) : (w.admin as { from: (t: string) => unknown }).from(tb)) } as never;
    assert.equal((await applyPosCollectiveSplit(failing, { tenantId: "t1", orderId: "o1" })).ok, false);
  });

  test("a failed write refuses the collection, so a sale is never taken half split", async () => {
    const w = fakeAdmin(world(), { failUpdate: true });
    const r = await applyPosCollectiveSplit(w.admin, { tenantId: "t1", orderId: "o1" });
    assert.equal(r.ok, false);
  });

  test("an order of another workspace is never touched", async () => {
    const w = fakeAdmin(world());
    const r = await applyPosCollectiveSplit(w.admin, { tenantId: "t2", orderId: "o1" });
    assert.deepEqual(r, { ok: true, changed: 0 });
    assert.equal(w.updates.length, 0);
  });
});

describe("wiring", () => {
  test("startCollection splits the sale before any money is claimed", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8");
    const call = src.indexOf("applyPosCollectiveSplit(");
    assert.ok(call > 0);
    assert.ok(call < src.indexOf("let reservationId"), "before a reservation or transaction exists");
    assert.ok(call > src.indexOf("const operationKey ="), "after the idempotency-key refusal: a refused collection splits nothing");
    assert.ok(call > src.indexOf("lockedCustomLineIds("), "after the manager-approval refusal");
    assert.ok(src.trimEnd().split("\n").length <= 800, "collection.ts stays under the 800-line cap");
  });
});
