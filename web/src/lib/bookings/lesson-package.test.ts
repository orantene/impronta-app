import { test } from "node:test";
import assert from "node:assert/strict";
import { createLessonPackage, drawdownLesson, unusedRefundableUnits } from "./lesson-package";

type Row = Record<string, unknown>;

function fake(store: { lesson_packages: Row[] }) {
  const from = () => {
    let mode: "select" | "insert" | "update" = "select";
    let inserted: Row[] = [];
    let patch: Row = {};
    const eqs: Array<[string, unknown]> = [];
    const match = () => store.lesson_packages.filter((row) => eqs.every(([k, v]) => row[k] === v));
    const apply = () => {
      if (mode === "insert") {
        for (const r of inserted) {
          const row = { ...r, id: (r.id as string) ?? crypto.randomUUID() };
          store.lesson_packages.push(row);
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
        const before = match();
        apply();
        if (mode === "update") return { data: before[0] ?? null, error: null };
        return { data: match()[0] ?? null, error: null };
      },
      single: async () => {
        apply();
        return { data: inserted[0] ?? match()[0] ?? null, error: null };
      },
      then: async (resolve: (v: { data: null; error: null }) => unknown) => {
        apply();
        return resolve({ data: null, error: null });
      },
    };
    return api;
  };
  return { from };
}

test("a ten-lesson package decrements; unused remaining is the refundable balance", async () => {
  const store = { lesson_packages: [] as Row[] };
  const created = await createLessonPackage(fake(store), { tenantId: "t1", bookingId: "b1", units: 10 });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.pack.remainingUnits, 10);
  const after = await drawdownLesson(fake(store), { tenantId: "t1", packageId: created.pack.id });
  assert.equal(after.ok, true);
  if (!after.ok) return;
  assert.equal(after.pack.remainingUnits, 9);
  assert.equal(unusedRefundableUnits(after.pack), 9);

  const foreign = await drawdownLesson(fake(store), { tenantId: "t2", packageId: created.pack.id });
  assert.equal(foreign.ok, false);
  if (foreign.ok) return;
  assert.equal(foreign.reason, "wrong_tenant");
  assert.equal(store.lesson_packages[0].remaining_units, 9);
});

test("the last package unit cannot be consumed twice", async () => {
  const store = { lesson_packages: [] as Row[] };
  const created = await createLessonPackage(fake(store), { tenantId: "t1", bookingId: "b1", units: 1 });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const first = await drawdownLesson(fake(store), {
    tenantId: "t1",
    packageId: created.pack.id,
    consumptionKey: "adm-1",
  });
  assert.equal(first.ok, true);
  const second = await drawdownLesson(fake(store), {
    tenantId: "t1",
    packageId: created.pack.id,
    consumptionKey: "adm-2",
  });
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.reason, "exhausted");
  assert.equal(store.lesson_packages[0].remaining_units, 0);
});

test("duplicate attendance replay does not consume a second unit via RPC", async () => {
  const store = { remaining: 3, consumed: new Set<string>() };
  const admin = {
    from: () => {
      throw new Error("TS path must not run when RPC exists");
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      assert.equal(fn, "drawdown_lesson_package");
      const key = String(args.p_reference_key);
      if (store.consumed.has(key)) {
        return { data: { ok: true, already: true, remaining_units: store.remaining, original_units: 3 }, error: null };
      }
      if (store.remaining < 1) {
        return { data: { ok: false, reason: "exhausted" }, error: null };
      }
      store.consumed.add(key);
      store.remaining -= 1;
      return { data: { ok: true, already: false, remaining_units: store.remaining, original_units: 3 }, error: null };
    },
  };
  const first = await drawdownLesson(admin, { tenantId: "t1", packageId: "pkg-1", consumptionKey: "adm-1" });
  const replay = await drawdownLesson(admin, { tenantId: "t1", packageId: "pkg-1", consumptionKey: "adm-1" });
  const other = await drawdownLesson(admin, { tenantId: "t1", packageId: "pkg-1", consumptionKey: "adm-2" });
  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  if (!first.ok || !replay.ok) return;
  assert.equal(first.already, false);
  assert.equal(replay.already, true);
  assert.equal(other.ok, true);
  assert.equal(store.remaining, 1);
  assert.equal(store.consumed.size, 2);
});
