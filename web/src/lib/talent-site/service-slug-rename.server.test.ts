import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { commitServiceSlugHistory, prepareServiceSlugRename, type SlugRename } from "./service-slug-rename.server";

const ID = "1a2b3c4d-0000-4000-8000-000000000000";
type Row = Record<string, unknown>;

function fakeDb(tables: { offering?: Row | null; slugs?: Row[]; scoped?: Row[] }, opts: { failTable?: string; failInsert?: boolean; missingSlugs?: boolean } = {}) {
  const log: string[] = [];
  const state = { slugs: (tables.slugs ?? []).map((r) => ({ offering_id: ID, ...r })) };
  const db = {
    from: (t: string) => {
      const filters: Array<[string, unknown]> = [];
      let patch: Row | null = null;
      const q: Record<string, unknown> = {};
      const result = () => {
        if (opts.failTable === t) return { data: null, error: { code: "XX", message: "boom" } };
        if (t === "offering_slugs" && opts.missingSlugs) return { data: null, error: { code: "42P01" } };
        if (patch && t === "offering_slugs") {
          for (const r of state.slugs) if (filters.every(([c, v]) => r[c] === v)) Object.assign(r, patch);
          log.push(`update ${JSON.stringify(patch)} ${JSON.stringify(filters)}`);
          return { data: null, error: null };
        }
        if (t === "talent_offerings") return { data: tables.offering ?? null, error: null };
        const hasScope = filters.some(([c]) => c === "owner_scope");
        return { data: hasScope ? (tables.scoped ?? []) : state.slugs, error: null };
      };
      q.select = () => q;
      q.eq = (c: string, v: unknown) => (filters.push([c, v]), q);
      q.in = () => q;
      q.update = (p: Row) => ((patch = p), q);
      q.insert = async (row: Row) => {
        log.push(`insert ${JSON.stringify(row)}`);
        return opts.failInsert ? { data: null, error: { code: "23505" } } : { data: null, error: null };
      };
      q.maybeSingle = async () => result();
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok);
      return q;
    },
  };
  return { db, log, state };
}

const OFFERING = { id: ID, title: "Corte clasico" };
const CUR = { id: "r1", locale: "es", slug: "corte-clasico", is_current: true };
const input = { offeringId: ID, talentProfileId: "p1", nextTitle: "Corte moderno" };

describe("prepareServiceSlugRename (slug history in offering_slugs)", () => {
  it("flag off: no read, nothing to write", async () => {
    const f = fakeDb({ offering: OFFERING, slugs: [CUR] });
    assert.equal(await prepareServiceSlugRename(f.db, input, { enabled: false }), null);
    assert.deepEqual(f.log, []);
  });

  it("a slug that followed the title: retire it and add the new one in this talent's scope", async () => {
    const f = fakeDb({ offering: OFFERING, slugs: [CUR], scoped: [{ locale: "es", slug: "corte-clasico" }] });
    const out = await prepareServiceSlugRename(f.db, input, { enabled: true });
    assert.deepEqual(out, {
      offeringId: ID,
      talentProfileId: "p1",
      scope: "t:p1",
      ops: [{ kind: "retire", rowId: "r1" }, { kind: "insert", locale: "es", slug: "corte-moderno" }],
    });
  });

  it("same title, a custom slug, or no slug rows: nothing to write", async () => {
    assert.equal(await prepareServiceSlugRename(fakeDb({ offering: OFFERING, slugs: [CUR] }).db, { ...input, nextTitle: "Corte clasico" }, { enabled: true }), null);
    assert.equal(await prepareServiceSlugRename(fakeDb({ offering: OFFERING, slugs: [{ ...CUR, slug: "mi-corte" }] }).db, input, { enabled: true }), null);
    assert.equal(await prepareServiceSlugRename(fakeDb({ offering: OFFERING, slugs: [] }).db, input, { enabled: true }), null);
  });

  it("the table missing (migration held) is silent; any failed read never blocks the save", async () => {
    assert.equal(await prepareServiceSlugRename(fakeDb({ offering: OFFERING }, { missingSlugs: true }).db, input, { enabled: true }), null);
    assert.equal(await prepareServiceSlugRename(fakeDb({ offering: OFFERING, slugs: [CUR] }, { failTable: "talent_offerings" }).db, input, { enabled: true }), null);
    assert.equal(await prepareServiceSlugRename(fakeDb({ offering: OFFERING, slugs: [CUR] }, { failTable: "offering_slugs" }).db, input, { enabled: true }), null);
  });

  it("another talent's service is never read: the offering is looked up by id AND this talent", async () => {
    const f = fakeDb({ offering: null, slugs: [CUR] });
    assert.equal(await prepareServiceSlugRename(f.db, input, { enabled: true }), null);
  });
});

describe("commitServiceSlugHistory", () => {
  const rename: SlugRename = {
    offeringId: ID,
    talentProfileId: "p1",
    scope: "t:p1",
    ops: [{ kind: "retire", rowId: "r1" }, { kind: "insert", locale: "es", slug: "corte-moderno" }],
  };

  it("retires the old row (it stays as history) then inserts the new current one", async () => {
    const f = fakeDb({ slugs: [CUR] });
    await commitServiceSlugHistory(f.db, rename);
    assert.equal(f.state.slugs[0].is_current, false);
    assert.match(f.log[1], /insert .*"owner_scope":"t:p1".*"slug":"corte-moderno".*"is_current":true/);
  });

  it("if the new slug cannot be written, the old row is put back (never a locale with no slug)", async () => {
    const f = fakeDb({ slugs: [CUR] }, { failInsert: true });
    await commitServiceSlugHistory(f.db, rename);
    assert.equal(f.state.slugs[0].is_current, true);
  });

  it("a re-used old slug is promoted, not duplicated", async () => {
    const f = fakeDb({ slugs: [CUR, { id: "r0", locale: "es", slug: "corte-moderno", is_current: false }] });
    await commitServiceSlugHistory(f.db, { ...rename, ops: [{ kind: "retire", rowId: "r1" }, { kind: "promote", rowId: "r0" }] });
    assert.deepEqual(f.state.slugs.map((r) => r.is_current), [false, true]);
    assert.equal(f.log.filter((l) => l.startsWith("insert")).length, 0);
  });

  it("no client: nothing happens", async () => {
    await commitServiceSlugHistory(null, rename);
  });
});
