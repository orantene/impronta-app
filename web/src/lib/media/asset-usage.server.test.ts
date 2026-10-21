import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ASSET_USAGE_MAX_PAGES,
  ASSET_USAGE_PAGE_SIZE,
  describeAssetUsageRefusal,
  findAssetUsage,
} from "./asset-usage.server";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[] | "error" | "missing">;

/** Tiny in-memory stand-in: eq / neq / in / is / limit / maybeSingle / single over plain rows. */
function fakeAdmin(tables: Tables): SupabaseClient {
  const from = (name: string) => {
    const src = tables[name] ?? [];
    let rows: Row[] = src === "error" || src === "missing" ? [] : [...src];
    let limit = Infinity;
    let from = 0;
    const q: Record<string, unknown> = {};
    const done = () => {
      if (src === "error") return { data: null, error: { message: "boom" } };
      if (src === "missing") return { data: null, error: { code: "42P01", message: "relation does not exist" } };
      return { data: rows.slice(from, from + limit), error: null };
    };
    q.select = () => q;
    q.eq = (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q);
    q.neq = (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q);
    q.in = (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), q);
    q.is = (c: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), q);
    q.limit = (n: number) => ((limit = n), q);
    q.order = () => q;
    q.range = (a: number, b: number) => ((from = a), (limit = b - a + 1), q);
    q.maybeSingle = async () => ({ data: done().data?.[0] ?? null, error: null });
    q.single = async () => ({ data: done().data?.[0] ?? null, error: null });
    q.then = (res: (v: unknown) => unknown) => Promise.resolve(done()).then(res);
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const T = "tenant-1";
const base = (): Tables => ({
  media_assets: [
    { id: "a-unused", tenant_id: T, storage_path: "tenant/tenant-1/a-unused.jpg", public_url: "https://x/unused" },
    { id: "a-logo", tenant_id: T, storage_path: "tenant/tenant-1/logo.png", public_url: "https://x/logo" },
    { id: "a-page", tenant_id: T, storage_path: "tenant/tenant-1/page.jpg", public_url: "https://x/page" },
    { id: "a-share", tenant_id: T, storage_path: "tenant/tenant-1/share.jpg", public_url: "https://x/share" },
    { id: "a-svc", tenant_id: T, storage_path: "tenant/tenant-1/svc.jpg", public_url: "https://x/svc" },
    { id: "a-other", tenant_id: T, storage_path: "tenant/tenant-1/other.jpg", public_url: "https://x/other" },
    { id: "a-hero", tenant_id: T, storage_path: "tenant/tenant-1/hero.jpg", public_url: "https://x/hero", owner_talent_profile_id: "tp1", variant_kind: "hero" },
    { id: "a-card", tenant_id: T, storage_path: "tenant/tenant-1/card.jpg", public_url: "https://x/card", owner_talent_profile_id: "tp1", variant_kind: "card" },
    { id: "a-gallery", tenant_id: T, storage_path: "tenant/tenant-1/gal.jpg", public_url: "https://x/gal", owner_talent_profile_id: "tp1", variant_kind: "gallery" },
    { id: "a-avatar", tenant_id: T, storage_path: "tenant/tenant-1/ava.jpg", public_url: "https://x/ava" },
    { id: "a-post", tenant_id: T, storage_path: "tenant/tenant-1/post.jpg", public_url: "https://x/post" },
    { id: "a-event", tenant_id: T, storage_path: "tenant/tenant-1/event.jpg", public_url: "https://x/event" },
    { id: "a-cover", tenant_id: T, storage_path: "tenant/tenant-1/cover.jpg", public_url: "https://x/cover" },
    { id: "a-addon", tenant_id: T, storage_path: "tenant/tenant-1/addon.jpg", public_url: "https://x/addon" },
    { id: "a-dark", tenant_id: T, storage_path: "tenant/tenant-1/dark.png", public_url: "https://x/dark" },
  ],
  profiles: [{ avatar_url: "https://x/ava" }],
  cms_posts: [{ id: "p1", tenant_id: T, cover_image_url: null, body_blocks: [{ type: "image", src: "tenant/tenant-1/post.jpg" }] }],
  events: [{ id: "e1", tenant_id: T, cover_media_id: "a-event" }],
  event_schedule_items: [],
  agency_talent_overlays: [{ id: "o1", cover_media_asset_id: "a-cover" }],
  talent_addon_groups: [{ id: "g1", media_asset_id: "a-addon" }],
  agency_business_identity: [],
  agencies: [{ id: T, settings: {} }],
  agency_branding: [{ tenant_id: T, logo_media_asset_id: "a-logo", favicon_media_asset_id: null, logo_dark_media_asset_id: "a-dark", theme_json: {} }],
  cms_sections: [
    { tenant_id: T, status: "published", props_jsonb: { images: [{ url: "https://cdn/tenant/tenant-1/page.jpg" }] } },
    { tenant_id: T, status: "archived", props_jsonb: { images: [{ url: "tenant/tenant-1/other.jpg" }] } },
  ],
  cms_pages: [{ tenant_id: T, og_image_media_asset_id: "a-share" }],
  talent_offering_media: [
    { offering_id: "o-mine", media_asset_id: "a-svc" },
    { offering_id: "o-foreign", media_asset_id: "a-other" },
  ],
  talent_offerings: [
    { id: "o-mine", tenant_id: T },
    { id: "o-foreign", tenant_id: "tenant-2" },
  ],
});

describe("findAssetUsage (TUL-1637)", () => {
  it("lets an unused asset go", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-unused"]);
    assert.deepEqual(r.blocked, []);
    assert.equal(r.unchecked, false);
  });

  it("blocks the wordmark (the old check)", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-logo"]);
    assert.deepEqual(r.brand, ["a-logo"]);
    assert.deepEqual(r.blocked, ["a-logo"]);
  });

  it("blocks an image used in a live page section", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-page"]);
    assert.deepEqual(r.pages, ["a-page"]);
    assert.deepEqual(r.blocked, ["a-page"]);
  });

  it("blocks a page share image", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-share"]);
    assert.deepEqual(r.pages, ["a-share"]);
  });

  it("blocks a service photo", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-svc"]);
    assert.deepEqual(r.services, ["a-svc"]);
    assert.deepEqual(r.blocked, ["a-svc"]);
  });

  it("ignores archived sections and another workspace's service links", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-other"]);
    assert.deepEqual(r.blocked, []);
  });

  it("blocks only the used ones in a mixed selection", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-unused", "a-page", "a-svc"]);
    assert.deepEqual([...r.blocked].sort(), ["a-page", "a-svc"]);
  });

  it("fails closed when the page lookup errors", async () => {
    const t = base();
    t.cms_sections = "error";
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.equal(r.unchecked, true);
    assert.deepEqual(r.blocked, ["a-unused"]);
  });

  it("fails closed when the service lookup errors", async () => {
    const t = base();
    t.talent_offering_media = "error";
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.equal(r.unchecked, true);
    assert.deepEqual(r.blocked, ["a-unused"]);
  });

  it("fails closed when the section scan runs out of pages", async () => {
    const t = base();
    t.cms_sections = Array.from({ length: ASSET_USAGE_PAGE_SIZE * ASSET_USAGE_MAX_PAGES }, () => ({ tenant_id: T, status: "published", props_jsonb: {} }));
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.equal(r.unchecked, true);
    assert.deepEqual(r.blocked, ["a-unused"]);
  });

  it("a workspace with thousands of sections can still delete an unused image (paged scan)", async () => {
    const t = base();
    t.cms_sections = Array.from({ length: 2500 }, () => ({ tenant_id: T, status: "published", props_jsonb: {} }));
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.equal(r.unchecked, false);
    assert.deepEqual(r.blocked, []);
  });

  it("finds a used image that sits on the LAST page of a big workspace", async () => {
    const t = base();
    t.cms_sections = [
      ...Array.from({ length: 2400 }, () => ({ tenant_id: T, status: "published", props_jsonb: {} })),
      { tenant_id: T, status: "published", props_jsonb: { url: "tenant/tenant-1/unused-but-here.jpg", id: "a-unused" } },
    ];
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.deepEqual(r.pages, ["a-unused"]);
  });

  it("blocks a talent's live hero and card photo, but not a portfolio (gallery) photo", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-hero", "a-card", "a-gallery"]);
    assert.deepEqual([...r.talent].sort(), ["a-card", "a-hero"]);
    assert.deepEqual([...r.blocked].sort(), ["a-card", "a-hero"]);
  });

  it("blocks an avatar, a roster cover, an event cover, a post image, a service add-on photo and the dark logo", async () => {
    const r = await findAssetUsage(fakeAdmin(base()), T, ["a-avatar", "a-cover", "a-event", "a-post", "a-addon", "a-dark"]);
    assert.deepEqual(r.talent.sort(), ["a-avatar", "a-cover"]);
    assert.deepEqual(r.events, ["a-event"]);
    assert.deepEqual(r.posts, ["a-post"]);
    assert.deepEqual(r.services, ["a-addon"]);
    assert.deepEqual(r.brand, ["a-dark"]);
  });

  it("treats a table the database does not have yet as 'nothing references it', not as a failure", async () => {
    const t = base();
    t.events = "missing";
    t.cms_posts = "missing";
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.equal(r.unchecked, false);
    assert.deepEqual(r.blocked, []);
  });

  it("fails closed when an events lookup errors for another reason", async () => {
    const t = base();
    t.events = "error";
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.equal(r.unchecked, true);
  });

  it("fails closed when the asset rows cannot be read", async () => {
    const t = base();
    t.media_assets = "error";
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.deepEqual(r.blocked, ["a-unused"]);
  });
});

const usage = (over: Partial<Record<string, string[] | boolean>> = {}) => ({
  brand: [], pages: [], posts: [], services: [], events: [], talent: [], unchecked: false, blocked: [], ...over,
}) as Parameters<typeof describeAssetUsageRefusal>[0];

describe("describeAssetUsageRefusal", () => {
  it("names where the images are used (EN)", () => {
    const msg = describeAssetUsageRefusal(usage({ brand: ["a"], pages: ["b", "c"], services: ["d"], blocked: ["a", "b", "c", "d"] }));
    assert.match(msg, /Nothing was deleted/);
    assert.match(msg, /wordmark, favicon or share image/);
    assert.match(msg, /2 on your site pages/);
    assert.match(msg, /service or product photo/);
  });

  it("says the same in Spanish (ES)", () => {
    const msg = describeAssetUsageRefusal(usage({ brand: ["a"], pages: ["b", "c"], events: ["e"], blocked: ["a", "b", "c", "e"] }), "es");
    assert.match(msg, /No se elimin[oó] nada/);
    assert.match(msg, /2 en las p[aá]ginas de tu sitio/);
    assert.match(msg, /en un evento/);
    assert.doesNotMatch(msg, /Nothing was deleted|on your site pages/);
  });

  it("says so plainly when the check could not finish, in both languages", () => {
    const u = usage({ unchecked: true, blocked: ["a"] });
    assert.match(describeAssetUsageRefusal(u), /could not check/);
    assert.match(describeAssetUsageRefusal(u, "es"), /No pudimos comprobar/);
  });
});

describe("actionDeleteMediaAssets wiring", () => {
  it("runs the usage check before any delete", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/(workspace)/[tenantSlug]/admin/media/actions.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function actionDeleteMediaAssets"));
    const body = fn.slice(0, fn.indexOf("// ─── Approve / reject"));
    assert.ok(body.includes("findAssetUsage(admin, tenantId, ids)"));
    assert.ok(body.indexOf("findAssetUsage") < body.indexOf("deleted_at: now"));
    assert.ok(!body.includes("listProtectedBrandAssetIds"));
    assert.ok(body.includes("describeAssetUsageRefusal(usage, locale)"));
  });
});
