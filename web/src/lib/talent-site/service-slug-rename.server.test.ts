import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { commitServiceSlugHistory, prepareServiceSlugRename, type SlugRenameDb } from "./service-slug-rename.server";

const ID = "1a2b3c4d-0000-4000-8000-000000000000";

function fakeDb(row: Record<string, unknown> | null, opts: { readError?: boolean } = {}) {
  const calls: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    from: (t: string) => {
      calls.push(`from ${t}`);
      const q = {
        select: (s: string) => (calls.push(`select ${s}`), q),
        eq: (c: string, v: unknown) => (calls.push(`eq ${c}=${String(v)}`), q),
        maybeSingle: async () => (opts.readError ? { data: null, error: { code: "XX", message: "boom" } } : { data: row, error: null }),
        update: (patch: Record<string, unknown>) => (updates.push(patch), q),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
      };
      return q;
    },
  } as unknown as SlugRenameDb;
  return { db, calls, updates };
}

const ROW = { id: ID, title: "Corte clásico", slug: null, slug_history: [], owner_kind: "talent", talent_profile_id: "p1", tenant_id: "t1" };

describe("prepareServiceSlugRename (C1: slug_history on rename)", () => {
  it("flag off: no read, nothing to write", async () => {
    const { db, calls } = fakeDb(ROW);
    assert.equal(await prepareServiceSlugRename(db, { offeringId: ID, nextTitle: "Corte moderno" }, { enabled: false, columnsAvailable: async () => true }), null);
    assert.deepEqual(calls, []);
  });

  it("columns absent (415800 held): no read, nothing to write", async () => {
    const { db, calls } = fakeDb(ROW);
    assert.equal(await prepareServiceSlugRename(db, { offeringId: ID, nextTitle: "Corte moderno" }, { enabled: true, columnsAvailable: async () => false }), null);
    assert.deepEqual(calls, []);
  });

  it("a rename with no custom slug records the old derived slug, newest first", async () => {
    const { db } = fakeDb({ ...ROW, slug_history: ["servicio-corte-1a2b3c4d"] });
    const out = await prepareServiceSlugRename(db, { offeringId: ID, nextTitle: "Corte moderno" }, { enabled: true, columnsAvailable: async () => true });
    assert.deepEqual(out, { offeringId: ID, slugHistory: ["servicio-corte-clasico-1a2b3c4d", "servicio-corte-1a2b3c4d"] });
  });

  it("same title, or a custom slug that stays: nothing to write", async () => {
    assert.equal(await prepareServiceSlugRename(fakeDb(ROW).db, { offeringId: ID, nextTitle: "Corte clásico" }, { enabled: true, columnsAvailable: async () => true }), null);
    assert.equal(
      await prepareServiceSlugRename(fakeDb({ ...ROW, slug: "corte" }).db, { offeringId: ID, nextTitle: "Corte moderno" }, { enabled: true, columnsAvailable: async () => true }),
      null,
    );
  });

  it("a failed read never blocks the save", async () => {
    const { db } = fakeDb(ROW, { readError: true });
    assert.equal(await prepareServiceSlugRename(db, { offeringId: ID, nextTitle: "Corte moderno" }, { enabled: true, columnsAvailable: async () => true }), null);
  });

  it("commit writes only slug_history on that row", async () => {
    const { db, updates, calls } = fakeDb(ROW);
    await commitServiceSlugHistory(db, { offeringId: ID, slugHistory: ["a-1"] });
    assert.deepEqual(updates, [{ slug_history: ["a-1"] }]);
    assert.ok(calls.includes(`eq id=${ID}`));
  });

  it("wired into the talent save (update path only)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/talent/offerings-actions.ts"), "utf8");
    assert.match(src, /prepareServiceSlugRename\(admin, \{ offeringId: offering\.id, nextTitle: offering\.title \}\)/);
    assert.match(src, /if \(slugRename\) await commitServiceSlugHistory\(admin, slugRename\)/);
  });
});
