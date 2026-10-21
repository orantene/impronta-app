import assert from "node:assert/strict";
import test from "node:test";

import { buildOfferingIndex, resolveOldServiceSlug, type OfferingSlugDbRow } from "./offering-index";
import { loadOfferingIndex } from "./offering-index.server";

const A = "1a2b3c4d-0000-4000-8000-000000000000";
const B = "9f8e7d6c-0000-4000-8000-000000000000";
const rows: OfferingSlugDbRow[] = [
  { offering_id: A, locale: "en", slug: "old-cut", is_current: false },
  { offering_id: A, locale: "en", slug: "new-cut", is_current: true },
  { offering_id: B, locale: "en", slug: "massage", is_current: true },
];
const index = buildOfferingIndex({ rows, offeringIds: [A, B, "55555555-0000-4000-8000-000000000000"], primaryLocale: "en" });
const ask = (slug: string, over: Partial<Parameters<typeof resolveOldServiceSlug>[0]> = {}) =>
  resolveOldServiceSlug({ slug, locale: "en", publicLocales: ["en"], hostKind: "business", index, ...over });

test("an old slug resolves to the offering that owned it", () => {
  assert.equal(ask("old-cut"), A);
});

test("the current slug resolves to its offering", () => {
  assert.equal(ask("new-cut"), A);
  assert.equal(ask("massage"), B);
});

test("an unknown slug, or an id8 that matches no offering, resolves to nothing", () => {
  assert.equal(ask("nope"), null);
  assert.equal(ask("zzzz-00000000"), null);
});

test("a current row beats a history row that claims the same slug", () => {
  const idx = buildOfferingIndex({
    rows: [
      { offering_id: A, locale: "en", slug: "dup", is_current: false },
      { offering_id: B, locale: "en", slug: "dup", is_current: true },
    ],
    offeringIds: [],
    primaryLocale: "en",
  });
  assert.equal(idx.findBySlug("en", "dup")?.offeringId, B);
});

test("a Spanish request uses the Spanish word and the Spanish slug rows", () => {
  const idx = buildOfferingIndex({
    rows: [
      { offering_id: A, locale: "es", slug: "corte-viejo", is_current: false },
      { offering_id: A, locale: "es", slug: "corte-nuevo", is_current: true },
    ],
    offeringIds: [A],
    primaryLocale: "es",
  });
  assert.equal(resolveOldServiceSlug({ slug: "corte-viejo", locale: "es", publicLocales: ["es"], hostKind: "talent", index: idx }), A);
});

/* ─── the loader: scoped reads, and every failure falls back to null ─── */

function fakeDb(opts: { slugsError?: { code: string }; idsError?: { code: string }; slugs?: unknown[]; ids?: unknown[] }) {
  const calls: string[] = [];
  const db = {
    from: (t: string) => {
      const f: Array<[string, string]> = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: string) => (f.push([c, v]), q),
        range: async () => {
          calls.push(`${t} ${JSON.stringify(f)}`);
          if (t === "offering_slugs") return opts.slugsError ? { data: null, error: opts.slugsError } : { data: opts.slugs ?? [], error: null };
          return opts.idsError ? { data: null, error: opts.idsError } : { data: opts.ids ?? [], error: null };
        },
      };
      return q;
    },
  };
  return { db, calls };
}

test("loader: reads are scoped to the owner (w: tenant, t: talent)", async () => {
  const w = fakeDb({ slugs: rows, ids: [{ id: A }] });
  const idx = await loadOfferingIndex(w.db, { owner: { kind: "workspace", tenantId: "tn1" }, primaryLocale: "en" });
  assert.equal(idx?.findBySlug("en", "old-cut")?.offeringId, A);
  assert.ok(w.calls.some((c) => c.includes('"owner_scope","w:tn1"')));
  assert.ok(w.calls.some((c) => c.includes('"tenant_id","tn1"') && c.includes('"owner_kind","workspace"')));
  const t = fakeDb({ slugs: [], ids: [] });
  await loadOfferingIndex(t.db, { owner: { kind: "talent", talentProfileId: "p1" }, primaryLocale: "en" });
  assert.ok(t.calls.some((c) => c.includes('"owner_scope","t:p1"')));
  assert.ok(t.calls.some((c) => c.includes('"talent_profile_id","p1"')));
});

test("loader: a missing table or any read error returns null (today's behaviour), never throws", async () => {
  const o = { owner: { kind: "workspace", tenantId: "tn1" } as const, primaryLocale: "en" };
  assert.equal(await loadOfferingIndex(fakeDb({ slugsError: { code: "42P01" } }).db, o), null);
  assert.equal(await loadOfferingIndex(fakeDb({ slugsError: { code: "PGRST205" } }).db, o), null);
  assert.equal(await loadOfferingIndex(fakeDb({ idsError: { code: "XX" } }).db, o), null);
  assert.equal(await loadOfferingIndex(null, o), null);
  assert.equal(await loadOfferingIndex({ from: () => { throw new Error("boom"); } }, o), null);
});
