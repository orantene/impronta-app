import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadTalentServicePresentation, primaryTalentTypeSlug, type TalentPresentationDeps } from "./load-talent-presentation.server";

function fakeDb(rows: unknown, error: unknown = null) {
  const calls: string[] = [];
  const q = {
    select: (s: string) => (calls.push(`select ${s}`), q),
    eq: (c: string, v: unknown) => (calls.push(`eq ${c}=${String(v)}`), q),
    then: (res: (v: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data: rows, error }).then(res),
  };
  return { db: { from: (t: string) => (calls.push(`from ${t}`), q) } as unknown as TalentPresentationDeps["db"], calls };
}

const deps = (db: TalentPresentationDeps["db"], enabled = true): TalentPresentationDeps => ({
  db,
  enabled,
  loadFaq: async () => [{ question: "¿Dónde?", answer: "CDMX" }],
  loadReviews: async () => ({ talentReviews: [{ id: "r", body: "Top", clientName: null, rating: 5, createdAt: "2026-10-01" }] }),
  loadRating: async () => ({ average: 4.9, count: 7 }),
});

describe("loadTalentServicePresentation", () => {
  it("flag off: undefined and no read at all (legacy widget)", async () => {
    const { db, calls } = fakeDb([]);
    assert.equal(await loadTalentServicePresentation("p1", "es", "talent_pro", deps(db, false)), undefined);
    assert.deepEqual(calls, []);
  });

  it("flag on: trade from the primary talent type, plan entitlements, FAQ and reviews", async () => {
    const { db, calls } = fakeDb([{ taxonomy_terms: { slug: "Chef", kind: "talent_type" } }]);
    const out = await loadTalentServicePresentation("p1", "es", "talent_basic", deps(db));
    assert.ok(out);
    assert.equal(out.tradeSlug, "chef");
    assert.equal(out.allowedModes.includes("own_page"), false);
    assert.deepEqual(out.talentFaq, [{ question: "¿Dónde?", answer: "CDMX" }]);
    assert.equal(out.reviews?.count, 7);
    assert.ok(calls.includes("eq is_primary=true"));
  });

  it("a failed trade read degrades to no trade (never throws)", async () => {
    const { db } = fakeDb(null, { message: "boom" });
    const out = await loadTalentServicePresentation("p1", "en", "talent_pro", deps(db));
    assert.equal(out?.tradeSlug, null);
    assert.equal(out?.allowedModes.includes("own_page"), true);
  });

  it("primaryTalentTypeSlug ignores non talent-type terms", () => {
    assert.equal(primaryTalentTypeSlug([{ taxonomy_terms: { slug: "cdmx", kind: "location" } }]), null);
    assert.equal(primaryTalentTypeSlug([{ taxonomy_terms: [{ slug: "tutor", kind: "talent_type" }] }]), "tutor");
    assert.equal(primaryTalentTypeSlug(null), null);
  });
});

describe("wiring", () => {
  it("loadServicesCatalogSources passes servicePresentation to the widget", () => {
    const src = readFileSync(join(process.cwd(), "src/components/home/homepage-cms-data-sources.ts"), "utf8");
    assert.match(src, /loadTalentServicePresentation\(/);
    assert.match(src, /servicePresentation/);
  });

  it("the services_catalog block builds its links through serviceCatalogPresentation and mounts the quick views", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"), "utf8");
    assert.match(src, /servicesCatalogQuickViews\(\{/);
    assert.match(src, /\{quickViews\.layer\}/);
    assert.match(src, /servicePresentation\?: import\("@\/lib\/services\/presentation\/catalog-presentation"\)\.ServicePresentationSource/);
  });
});
