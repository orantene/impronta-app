import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ASSET_USAGE_SECTION_SCAN_LIMIT,
  describeAssetUsageRefusal,
  findAssetUsage,
} from "./asset-usage.server";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[] | "error">;

/** Tiny in-memory stand-in: eq / neq / in / is / limit / maybeSingle / single over plain rows. */
function fakeAdmin(tables: Tables): SupabaseClient {
  const from = (name: string) => {
    const src = tables[name] ?? [];
    let rows: Row[] = src === "error" ? [] : [...src];
    let limit = Infinity;
    const q: Record<string, unknown> = {};
    const done = () => {
      if (src === "error") return { data: null, error: { message: "boom" } };
      return { data: rows.slice(0, limit), error: null };
    };
    q.select = () => q;
    q.eq = (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q);
    q.neq = (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q);
    q.in = (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), q);
    q.is = (c: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), q);
    q.limit = (n: number) => ((limit = n), q);
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
  ],
  agencies: [{ id: T, settings: {} }],
  agency_branding: [{ tenant_id: T, logo_media_asset_id: "a-logo", favicon_media_asset_id: null, theme_json: {} }],
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

  it("fails closed when the section scan hits its cap", async () => {
    const t = base();
    t.cms_sections = Array.from({ length: ASSET_USAGE_SECTION_SCAN_LIMIT }, () => ({
      tenant_id: T,
      status: "published",
      props_jsonb: {},
    }));
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.equal(r.unchecked, true);
    assert.deepEqual(r.blocked, ["a-unused"]);
  });

  it("fails closed when the asset rows cannot be read", async () => {
    const t = base();
    t.media_assets = "error";
    const r = await findAssetUsage(fakeAdmin(t), T, ["a-unused"]);
    assert.deepEqual(r.blocked, ["a-unused"]);
  });
});

describe("describeAssetUsageRefusal", () => {
  it("names where the images are used", () => {
    const msg = describeAssetUsageRefusal({
      brand: ["a"],
      pages: ["b", "c"],
      services: ["d"],
      unchecked: false,
      blocked: ["a", "b", "c", "d"],
    });
    assert.match(msg, /Nothing was deleted/);
    assert.match(msg, /wordmark or favicon/);
    assert.match(msg, /2 on your site pages/);
    assert.match(msg, /service or product photo/);
  });

  it("says so plainly when the check could not finish", () => {
    const msg = describeAssetUsageRefusal({ brand: [], pages: [], services: [], unchecked: true, blocked: ["a"] });
    assert.match(msg, /could not check/);
    assert.match(msg, /Nothing was deleted/);
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
  });
});
