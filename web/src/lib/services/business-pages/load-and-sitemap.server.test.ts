import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { businessServicePagesOn, pickBusinessServiceRow, type BusinessServiceRow } from "./load.server";
import { businessServiceSitemapEntries, loadBusinessServiceSitemapEntries } from "./sitemap-entries";

const T = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
function row(id8: string, extra: Partial<BusinessServiceRow> = {}): BusinessServiceRow {
  return {
    id: `${id8}-0000-4000-8000-000000000000`,
    tenant_id: T,
    owner_kind: "workspace",
    talent_profile_id: null,
    kind: "service",
    title: "Masaje",
    status: "published",
    moderation_state: "approved",
    visibility: "public",
    ...extra,
  } as unknown as BusinessServiceRow;
}

describe("TUL-1316: business talents = owner + agency_created roster", () => {
  it("resolves the Limpieza set owned by two agency_created roster talents (owner has none)", async () => {
    const { loadBusinessTalentIds } = await import("./load.server");
    const A = "7910ef88-0000-4000-8000-000000000001";
    const B = "135fa86e-0000-4000-8000-000000000002";
    const filters: string[] = [];
    const db = {
      from: (table: string) => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "order", "limit", "is"]) q[m] = () => q;
        q.eq = (c: string, v: unknown) => (filters.push(`${table}.${c}=${String(v)}`), q);
        q.maybeSingle = async () => ({ data: null, error: null });
        q.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: table === "agency_talent_roster" ? [{ talent_profile_id: A }, { talent_profile_id: B }] : [], error: null }).then(res);
        return q;
      },
    } as never;
    const ids = await loadBusinessTalentIds(db, T);
    assert.deepEqual([...ids].sort(), [A, B].sort());
    assert.ok(filters.includes("agency_talent_roster.source_type=agency_created"));
    assert.ok(filters.includes("agency_talent_roster.status=active"));
    const set = [["d21f897d", A], ["520f2677", A], ["f5ce66bd", B]].map(([id8, tp]) =>
      row(id8!, { title: "Limpieza", owner_kind: "talent", talent_profile_id: tp }));
    assert.ok(pickBusinessServiceRow(set, "limpieza-estandar-d21f897d", T, new Set(), ids));
    assert.ok(pickBusinessServiceRow(set, "limpieza-expres-f5ce66bd", T, new Set(), ids));
    // a freelancer / hub-claimed roster talent (not in the set) stays excluded
    const other = row("aaaaaaaa", { owner_kind: "talent", talent_profile_id: "99999999-0000-4000-8000-000000000009" });
    assert.equal(pickBusinessServiceRow([other], "aaaaaaaa", T, new Set(), ids), null);
  });
});

describe("pickBusinessServiceRow", () => {
  const none = new Set<string>();
  it("finds the workspace's own (house) published, approved, public or on_request service by id8", () => {
    assert.equal(pickBusinessServiceRow([row("aaaaaaaa")], "masaje-aaaaaaaa", T, none)?.id, row("aaaaaaaa").id);
    assert.ok(pickBusinessServiceRow([row("aaaaaaaa", { visibility: "on_request" })], "x-aaaaaaaa", T, none));
  });
  it("TUL-1325: a talent-owned row is never a business page unless it is the workspace OWNER's own provider row", () => {
    const mine = row("aaaaaaaa", { owner_kind: "talent", talent_profile_id: OWNER });
    assert.equal(pickBusinessServiceRow([mine], "aaaaaaaa", T, none), null);
    assert.equal(pickBusinessServiceRow([mine], "aaaaaaaa", T, none, new Set([OWNER]))?.id, mine.id);
  });
  it("TUL-1316: the cleaning set (owner-provider rows, id8 slugs) resolves by id8", () => {
    const set = [
      row("d21f897d", { title: "Limpieza estándar", owner_kind: "talent", talent_profile_id: OWNER }),
      row("520f2677", { title: "Limpieza profunda", owner_kind: "talent", talent_profile_id: OWNER }),
      row("f5ce66bd", { title: "Limpieza exprés", owner_kind: "talent", talent_profile_id: OWNER }),
    ];
    for (const [slug, id8] of [["limpieza-estandar-d21f897d", "d21f897d"], ["limpieza-profunda-520f2677", "520f2677"], ["limpieza-expres-f5ce66bd", "f5ce66bd"]]) {
      assert.ok(String(pickBusinessServiceRow(set, slug, T, none, new Set([OWNER]))?.id).startsWith(id8), slug);
    }
  });
  it("TUL-1322: never an event-backing package or the reservation item (non-menu offerings)", () => {
    assert.equal(pickBusinessServiceRow([row("aaaaaaaa", { kind: "package" })], "aaaaaaaa", T, new Set([row("aaaaaaaa").id as string])), null);
  });
  it("never a draft, pending, agency-only, product, another tenant's or a roster talent's row", () => {
    for (const extra of [
      { status: "draft" },
      { moderation_state: "pending" },
      { visibility: "agency_only" },
      { kind: "product" },
      { tenant_id: "33333333-3333-4333-8333-333333333333" },
      { owner_kind: "talent", talent_profile_id: "44444444-4444-4444-8444-444444444444" },
    ] as Partial<BusinessServiceRow>[]) {
      assert.equal(pickBusinessServiceRow([row("aaaaaaaa", extra)], "aaaaaaaa", T, none), null, JSON.stringify(extra));
    }
  });
});

function fakeDb(plan: string | null, opts: { planError?: boolean; eventOfferingIds?: string[]; nonMenuError?: boolean } = {}) {
  const reads: string[] = [];
  const filters: string[] = [];
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const m of ["select", "or", "in", "order", "limit", "not", "range"]) q[m] = self;
    q.eq = (c: string, v: unknown) => (filters.push(`${table}.${c}=${String(v)}`), q);
    q.maybeSingle = async () =>
      table === "agencies"
        ? opts.planError ? { data: null, error: { message: "x" } } : { data: { plan_tier: plan }, error: null }
        : { data: null, error: null };
    q.then = (res: (v: unknown) => unknown) => {
      if (table === "events") {
        return Promise.resolve(opts.nonMenuError ? { data: null, error: { message: "x" } } : { data: (opts.eventOfferingIds ?? []).map((offering_id) => ({ offering_id })), error: null }).then(res);
      }
      if (table === "venue_service_rules") return Promise.resolve({ data: [], error: null }).then(res);
      return Promise.resolve({ data: table === "talent_offerings" ? [row("aaaaaaaa", { title: "Masaje relajante" }), row("bbbbbbbb", { title: "Cena show", kind: "package" })] : [], error: null }).then(res);
    };
    return q;
  };
  return { db: { from: (t: string) => (reads.push(t), chain(t)) } as never, reads, filters };
}

describe("businessServicePagesOn", () => {
  it("flag off: no read, off", async () => {
    const { db, reads } = fakeDb("agency");
    assert.equal(await businessServicePagesOn(db, T, false), false);
    assert.deepEqual(reads, []);
  });
  it("flag on: studio / agency / network yes, free no, read error no", async () => {
    assert.equal(await businessServicePagesOn(fakeDb("agency").db, T, true), true);
    assert.equal(await businessServicePagesOn(fakeDb("free").db, T, true), false);
    assert.equal(await businessServicePagesOn(fakeDb("agency", { planError: true }).db, T, true), false);
  });
});

describe("sitemap entries", () => {
  it("one entry per locale with the localized word and hreflang", () => {
    const out = businessServiceSitemapEntries([{ id: row("aaaaaaaa").id as string, title: "Masaje relajante", updatedAt: "2026-10-01T00:00:00Z" }], {
      origin: "https://spa.example",
      defaultLocale: "es",
      supportedLocales: ["es", "en"],
      now: new Date("2026-10-19T00:00:00Z"),
    });
    assert.deepEqual(out.map((e) => e.url), [
      "https://spa.example/servicios/masaje-relajante-aaaaaaaa",
      "https://spa.example/en/services/masaje-relajante-aaaaaaaa",
    ]);
    assert.ok(out[0]!.alternates?.languages);
  });
  it("TUL-1322: event-backing packages and the reservation item are left out of the sitemap", async () => {
    const out = await loadBusinessServiceSitemapEntries({
      supabase: fakeDb("agency", { eventOfferingIds: [row("bbbbbbbb").id as string] }).db,
      tenantId: T, origin: "https://spa.example", defaultLocale: "es", supportedLocales: ["es"], flagOn: true,
    });
    assert.deepEqual(out.map((e) => e.url), ["https://spa.example/servicios/masaje-relajante-aaaaaaaa"]);
  });
  it("TUL-1322: a failed non-menu read fails closed (no entries)", async () => {
    const out = await loadBusinessServiceSitemapEntries({
      supabase: fakeDb("agency", { nonMenuError: true }).db,
      tenantId: T, origin: "https://spa.example", defaultLocale: "es", supportedLocales: ["es"], flagOn: true,
    });
    assert.deepEqual(out, []);
  });
  it("TUL-1325: rows are scoped to this tenant, house rows plus the owner's own provider rows", async () => {
    const { db, filters } = fakeDb("agency");
    await loadBusinessServiceSitemapEntries({ supabase: db, tenantId: T, origin: "https://spa.example", defaultLocale: "es", supportedLocales: ["es"], flagOn: true });
    assert.ok(filters.includes(`talent_offerings.tenant_id=${T}`));
    assert.ok(!filters.includes("talent_offerings.owner_kind=talent"));
  });
  it("flag off lists nothing", async () => {
    const out = await loadBusinessServiceSitemapEntries({ supabase: fakeDb("agency").db, tenantId: T, origin: "https://spa.example", defaultLocale: "es", supportedLocales: ["es"], flagOn: false });
    assert.deepEqual(out, []);
  });
  it("sitemap.ts appends the business service entries", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/sitemap.ts", "utf8");
    assert.match(src, /loadBusinessServiceSitemapEntries\(\{/);
  });
});

describe("loadBusinessServiceRows: order and no silent cap", () => {
  it("orders by sort_order then id and pages past 1000 rows", async () => {
    const orders: string[] = [];
    const ranges: Array<[number, number]> = [];
    const total = 1203;
    const db = {
      from: (table: string) => {
        const q: Record<string, unknown> = {};
        let from = 0;
        let to = 0;
        for (const m of ["select", "eq", "or", "in", "not"]) q[m] = () => q;
        q.order = (col: string) => (table === "talent_offerings" && orders.push(col), q);
        q.limit = () => q;
        q.is = () => q;
        q.maybeSingle = async () => ({ data: null, error: null });
        q.range = (a: number, b: number) => ((from = a), (to = b), ranges.push([a, b]), q);
        q.then = (res: (v: unknown) => unknown) => {
          const n = Math.max(0, Math.min(to, total - 1) - from + 1);
          return Promise.resolve({ data: Array.from({ length: n }, (_, i) => row(String(from + i).padStart(8, "0"))), error: null }).then(res);
        };
        return q;
      },
    } as never;
    const { loadBusinessServiceRows } = await import("./load.server");
    const out = await loadBusinessServiceRows(db, T, { nonMenuIds: new Set() });
    assert.equal(out?.rows.length, total);
    assert.deepEqual(orders.slice(0, 2), ["sort_order", "id"]);
    assert.ok(ranges.length >= 2);
  });
});

describe("route wiring (static)", () => {
  it("the booking panel goes to the workspace /book page with THIS service (business homes do not read ?book=), and one request loads once", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/(public)/_services/business-service-route.tsx", "utf8");
    assert.match(src, /businessServiceBookHref\(bookPath, offering\.id\)/);
    assert.doesNotMatch(src, /serviceBookHref\(/);
    assert.match(src, /const load = cache\(/);
  });
  it("TUL-1323: the slug (route, 308 target, canonical, hreflang) is built from the primary-language title, the same as the sitemap", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/(public)/_services/business-service-route.tsx", "utf8");
    assert.match(src, /offering: \{ id: offering\.id, title: loaded\.res\.slugTitle \}/);
    const load = readFileSync("src/lib/services/business-pages/load.server.ts", "utf8");
    assert.match(load, /slugTitle: String\(row\.title \?\? ""\)/);
  });
});
