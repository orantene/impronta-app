import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  WORKSPACE_ASSET_URL_ERROR,
  assertWorkspaceAssetUrl,
  isOwnLogoUploadPath,
  parsePublicStorageUrl,
} from "./workspace-asset-url";

const HOST = "https://proj.supabase.co";
const T = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const pub = (path: string, bucket = "media-public") => `${HOST}/storage/v1/object/public/${bucket}/${path}`;

type Row = Record<string, unknown>;

/** Equality-only in-memory stand-in; records every filter so tests can prove no `.or()` is used. */
function fakeDb(rows: Row[], opts: { fail?: boolean } = {}) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      calls.push(`from:${table}`);
      let out = [...rows];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => ((out = out.filter((r) => r[c] === v)), q);
      q.is = (c: string, v: unknown) => ((out = out.filter((r) => (r[c] ?? null) === v)), q);
      q.limit = () => q;
      q.or = () => {
        calls.push("or");
        return q;
      };
      q.then = (res: (v: unknown) => unknown) =>
        Promise.resolve(opts.fail ? { data: null, error: { message: "boom" } } : { data: out, error: null }).then(res);
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const gallery = (over: Row = {}): Row => ({
  id: "a1",
  tenant_id: T,
  bucket_id: "media-public",
  storage_path: `tenant/${T}/branding/logo.png`,
  public_url: pub(`tenant/${T}/branding/logo.png`),
  deleted_at: null,
  ...over,
});

describe("parsePublicStorageUrl", () => {
  it("splits bucket and path", () => {
    assert.deepEqual(parsePublicStorageUrl(pub("a/b.png")), { bucket: "media-public", path: "a/b.png" });
  });
  it("refuses non-storage paths, traversal and empty segments", () => {
    assert.equal(parsePublicStorageUrl(`${HOST}/rest/v1/x`), null);
    // An encoded slash decodes AFTER the URL parser ran, so traversal can reappear: refused.
    assert.equal(parsePublicStorageUrl(pub("a%2F..%2Fb.png")), null);
    // The URL parser collapses an encoded dot-segment before we see it, so the path we match is the
    // path that would actually be fetched: it can never reach outside what a row or the prefix names.
    assert.deepEqual(parsePublicStorageUrl(pub("a/%2e%2e/b.png")), { bucket: "media-public", path: "b.png" });
    assert.equal(parsePublicStorageUrl(pub("a//b.png")), null);
    assert.equal(parsePublicStorageUrl("not a url"), null);
  });
});

describe("assertWorkspaceAssetUrl (TUL-1635)", () => {
  it("refuses an arbitrary external URL", async () => {
    const { db } = fakeDb([gallery()]);
    const r = await assertWorkspaceAssetUrl(db, T, "https://evil.example/pixel.png", HOST);
    assert.deepEqual(r, { ok: false, error: WORKSPACE_ASSET_URL_ERROR });
  });

  it("refuses http and the wrong host", async () => {
    const { db } = fakeDb([gallery()]);
    assert.equal((await assertWorkspaceAssetUrl(db, T, pub("x.png").replace("https", "http"), HOST)).ok, false);
    assert.equal((await assertWorkspaceAssetUrl(db, T, "https://other.supabase.co/storage/v1/object/public/media-public/x.png", HOST)).ok, false);
  });

  it("accepts a live gallery asset of this workspace, by public URL", async () => {
    const { db } = fakeDb([gallery()]);
    assert.equal((await assertWorkspaceAssetUrl(db, T, pub(`tenant/${T}/branding/logo.png`), HOST)).ok, true);
  });

  it("accepts a live gallery asset matched by bucket and path when public_url is null", async () => {
    const { db } = fakeDb([gallery({ public_url: null })]);
    assert.equal((await assertWorkspaceAssetUrl(db, T, pub(`tenant/${T}/branding/logo.png`), HOST)).ok, true);
  });

  it("refuses another workspace's asset", async () => {
    const { db } = fakeDb([gallery({ tenant_id: OTHER, storage_path: `tenant/${OTHER}/branding/logo.png`, public_url: pub(`tenant/${OTHER}/branding/logo.png`) })]);
    const r = await assertWorkspaceAssetUrl(db, T, pub(`tenant/${OTHER}/branding/logo.png`), HOST);
    assert.equal(r.ok, false);
  });

  it("refuses a deleted gallery asset", async () => {
    const { db } = fakeDb([gallery({ deleted_at: "2026-10-01T00:00:00Z" })]);
    assert.equal((await assertWorkspaceAssetUrl(db, T, pub(`tenant/${T}/branding/logo.png`), HOST)).ok, false);
  });

  it("refuses a file under this tenant's prefix that has no gallery row", async () => {
    const { db } = fakeDb([]);
    assert.equal((await assertWorkspaceAssetUrl(db, T, pub(`tenant/${T}/branding/ghost.png`), HOST)).ok, false);
  });

  it("accepts the workspace's own logo upload with no gallery row, and no query", async () => {
    const { db, calls } = fakeDb([]);
    const r = await assertWorkspaceAssetUrl(db, T, pub(`agency-logos/${T}/abc.png`), HOST);
    assert.equal(r.ok, true);
    assert.deepEqual(calls, []);
  });

  it("refuses another workspace's logo upload", async () => {
    const { db } = fakeDb([]);
    assert.equal((await assertWorkspaceAssetUrl(db, T, pub(`agency-logos/${OTHER}/abc.png`), HOST)).ok, false);
  });

  it("fails closed when the lookup errors", async () => {
    const { db } = fakeDb([gallery()], { fail: true });
    const r = await assertWorkspaceAssetUrl(db, T, pub(`tenant/${T}/branding/logo.png`), HOST);
    assert.equal(r.ok, false);
  });

  it("never splices the URL into a PostgREST .or() filter", async () => {
    const { db, calls } = fakeDb([gallery()]);
    await assertWorkspaceAssetUrl(db, T, pub("x,deleted_at.is.null).png"), HOST);
    assert.ok(!calls.includes("or"));
  });
});

describe("isOwnLogoUploadPath", () => {
  it("matches only this tenant's agency-logos prefix in media-public", () => {
    assert.equal(isOwnLogoUploadPath({ bucket: "media-public", path: `agency-logos/${T}/a.png` }, T), true);
    assert.equal(isOwnLogoUploadPath({ bucket: "media-public", path: `agency-logos/${OTHER}/a.png` }, T), false);
    assert.equal(isOwnLogoUploadPath({ bucket: "other", path: `agency-logos/${T}/a.png` }, T), false);
    assert.equal(isOwnLogoUploadPath({ bucket: "media-public", path: `agency-logos/${T}x/a.png` }, T), false);
  });
});

describe("updateAgencyBranding wiring", () => {
  const src = readFileSync(join(__dirname, "..", "server-actions", "admin-workspace-settings.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function updateAgencyBranding"), src.indexOf("export async function updateWorkspaceAccount"));

  it("checks a new logo and favicon before reading or writing any settings", () => {
    const at = fn.indexOf("assertWorkspaceAssetUrl(admin, tenantId, url)");
    assert.ok(at > 0);
    assert.ok(at < fn.indexOf('.from("agencies")'));
    assert.ok(at < fn.indexOf("syncBrandSettingsToTheme("));
  });

  it("checks only strings: null clears and undefined leaves alone", () => {
    assert.match(fn, /filter\(\(u\): u is string => typeof u === "string"\)/);
  });
});
