import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteOrArchiveTalentOffering } from "./offering-delete-or-archive";

/**
 * TUL-1335: the talent-side service delete archives anything published or sold
 * and never issues a DELETE for it. Fake DB records every write.
 */

type Row = { id: string; status: string | null; first_published_at: string | null };
type Fixture = {
  row: Row | null;
  orderLines?: number;
  bookings?: number;
  historyError?: boolean;
  rowError?: boolean;
};

function makeFake(fx: Fixture) {
  const calls: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      let op: "select" | "update" | "delete" = "select";
      let head = false;
      const q = {
        select(_cols: string, opts?: { head?: boolean }) {
          head = Boolean(opts?.head);
          return q;
        },
        update(v: Record<string, unknown>) {
          op = "update";
          updates.push(v);
          return q;
        },
        delete() {
          op = "delete";
          return q;
        },
        eq() {
          return q;
        },
        maybeSingle() {
          calls.push(`${table}.select`);
          return Promise.resolve({ data: fx.rowError ? null : fx.row, error: fx.rowError ? { message: "boom" } : null });
        },
        then(resolveFn: (v: unknown) => unknown) {
          calls.push(`${table}.${op}`);
          if (head) {
            if (fx.historyError) return resolveFn({ count: null, error: { message: "boom" } });
            const count = table === "order_lines" ? fx.orderLines ?? 0 : fx.bookings ?? 0;
            return resolveFn({ count, error: null });
          }
          return resolveFn({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls, updates };
}

const base: Row = { id: "o1", status: "draft", first_published_at: null };

test("an offering with an order line is archived, never deleted", async () => {
  const f = makeFake({ row: base, orderLines: 2 });
  const res = await deleteOrArchiveTalentOffering(f.admin, "t1", "o1");
  assert.deepEqual(res, { ok: true, outcome: "archived" });
  assert.equal(f.updates[0]?.status, "archived");
  assert.ok(!f.calls.includes("talent_offerings.delete"));
});

test("an offering with a booking is archived, never deleted", async () => {
  const f = makeFake({ row: base, bookings: 1 });
  const res = await deleteOrArchiveTalentOffering(f.admin, "t1", "o1");
  assert.deepEqual(res, { ok: true, outcome: "archived" });
  assert.ok(!f.calls.includes("talent_offerings.delete"));
});

test("published (or ever published) but never sold is archived", async () => {
  for (const row of [
    { ...base, status: "published" },
    { ...base, first_published_at: "2026-01-01T00:00:00Z" },
  ]) {
    const f = makeFake({ row });
    const res = await deleteOrArchiveTalentOffering(f.admin, "t1", "o1");
    assert.deepEqual(res, { ok: true, outcome: "archived" });
    assert.ok(!f.calls.includes("talent_offerings.delete"));
  }
});

test("never published and no history is deleted", async () => {
  const f = makeFake({ row: base });
  const res = await deleteOrArchiveTalentOffering(f.admin, "t1", "o1");
  assert.deepEqual(res, { ok: true, outcome: "deleted" });
  assert.ok(f.calls.includes("talent_offerings.delete"));
  assert.equal(f.updates.length, 0);
});

test("a failed history read fails closed: archived, delete never issued", async () => {
  const f = makeFake({ row: base, historyError: true });
  const res = await deleteOrArchiveTalentOffering(f.admin, "t1", "o1");
  assert.deepEqual(res, { ok: true, outcome: "archived" });
  assert.ok(!f.calls.includes("talent_offerings.delete"));
});

test("a failed row read deletes nothing", async () => {
  const f = makeFake({ row: base, rowError: true });
  const res = await deleteOrArchiveTalentOffering(f.admin, "t1", "o1");
  assert.equal(res.ok, false);
  assert.ok(!f.calls.includes("talent_offerings.delete"));
});

test("a spoofed client flag cannot force a hard delete", async () => {
  const f = makeFake({ row: base, orderLines: 1 });
  // Extra args (a hostile caller passing force flags) are ignored: the function takes no such input.
  const call = deleteOrArchiveTalentOffering as unknown as (...a: unknown[]) => Promise<unknown>;
  const res = await call(f.admin, "t1", "o1", undefined, { force: true, hardDelete: true });
  assert.deepEqual(res, { ok: true, outcome: "archived" });
  assert.ok(!f.calls.includes("talent_offerings.delete"));
});

test("the talent action routes through the shared rule and the workspace rule is the same", () => {
  const SRC = resolve(process.cwd(), "src/lib/talent");
  const actions = readFileSync(join(SRC, "offerings-actions.ts"), "utf8");
  const del = actions.slice(actions.indexOf("export async function deleteTalentOffering("), actions.indexOf("export async function setOfferingPublication"));
  assert.ok(del.includes("deleteOrArchiveTalentOffering("));
  assert.equal(del.includes(".delete()"), false);
  // Same history rule as the workspace side (menu-offerings-actions offeringHasHistory).
  const ws = readFileSync(join(SRC, "menu-offerings-actions.ts"), "utf8");
  const mine = readFileSync(join(SRC, "offering-delete-or-archive.ts"), "utf8");
  for (const needle of [
    'row.status === "published" || row.first_published_at',
    'from("order_lines")',
    'from("talent_bookings")',
  ]) {
    assert.ok(ws.includes(needle), `workspace rule lost: ${needle}`);
    assert.ok(mine.includes(needle), `talent rule drifted: ${needle}`);
  }
});
