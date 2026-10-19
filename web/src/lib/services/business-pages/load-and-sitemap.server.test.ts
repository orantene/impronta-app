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

describe("pickBusinessServiceRow", () => {
  const owners = new Set([OWNER]);
  it("finds the workspace's own published, approved, public or on_request service by id8", () => {
    assert.equal(pickBusinessServiceRow([row("aaaaaaaa")], "masaje-aaaaaaaa", T, owners)?.id, row("aaaaaaaa").id);
    assert.ok(pickBusinessServiceRow([row("aaaaaaaa", { visibility: "on_request" })], "x-aaaaaaaa", T, owners));
    assert.ok(pickBusinessServiceRow([row("aaaaaaaa", { owner_kind: "talent", talent_profile_id: OWNER })], "aaaaaaaa", T, owners));
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
      assert.equal(pickBusinessServiceRow([row("aaaaaaaa", extra)], "aaaaaaaa", T, owners), null, JSON.stringify(extra));
    }
  });
});

function fakeDb(plan: string | null, opts: { planError?: boolean } = {}) {
  const reads: string[] = [];
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const m of ["select", "eq", "or", "in", "order", "limit"]) q[m] = self;
    q.maybeSingle = async () =>
      table === "agencies"
        ? opts.planError ? { data: null, error: { message: "x" } } : { data: { plan_tier: plan }, error: null }
        : { data: null, error: null };
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: table === "talent_offerings" ? [row("aaaaaaaa", { title: "Masaje relajante" })] : [], error: null }).then(res);
    return q;
  };
  return { db: { from: (t: string) => (reads.push(t), chain(t)) } as never, reads };
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
