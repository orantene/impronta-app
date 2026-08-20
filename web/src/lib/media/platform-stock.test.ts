import assert from "node:assert/strict";
import test from "node:test";

import {
  PLATFORM_STOCK_TENANT_SLUG,
  STOCK_FOLDER,
  queryPlatformStock,
  resolveStockTenantId,
} from "./platform-stock";
import { BRANDING_FOLDER, LIFESTYLE_FOLDER } from "./system-folders";

/** Supabase stand-in: enough shape for the read path, and a call recorder. */
function fakeDb(opts: {
  stockTenantId?: string | null;
  folderId?: string | null;
  assetIds?: string[];
  assets?: Array<Record<string, unknown>>;
}) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      calls.push({ table, filters });
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
        is: (col: string, val: unknown) => { filters[col] = val; return chain; },
        in: (col: string, val: unknown) => { filters[col] = val; return chain; },
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "agencies") {
            return { data: opts.stockTenantId ? { id: opts.stockTenantId } : null };
          }
          if (table === "media_folders") {
            return { data: opts.folderId ? { id: opts.folderId } : null };
          }
          return { data: null };
        },
        then: undefined,
      };
      // media_folder_items / media_assets resolve as awaited thenables
      if (table === "media_folder_items") {
        (chain as { then: unknown }).then = (res: (v: unknown) => void) =>
          res({ data: (opts.assetIds ?? []).map((id) => ({ asset_id: id })) });
      }
      if (table === "media_assets") {
        (chain as { then: unknown }).then = (res: (v: unknown) => void) =>
          res({ data: opts.assets ?? [] });
      }
      return chain as never;
    },
  };
  return { client: client as never, calls };
}

const ASSET = {
  id: "a1",
  storage_path: "tenant/t/stock/x.jpg",
  bucket_id: "media-public",
  width: 1600,
  height: 900,
  alt_text: "A studio meeting between three people at a table.",
  metadata: { stock_category: "editorial" },
};

test("stock lives under its own tenant, never tenant #1", () => {
  // PLATFORM_TENANT_ID in integrations/platform-defaults.ts is …0001, which is
  // Impronta's own tenant. If stock resolved there, "the shared library" and
  // "Impronta's private media" would be the same rows and every other tenant
  // would be reading Impronta's photographs.
  assert.equal(PLATFORM_STOCK_TENANT_SLUG, "tulala");
  assert.notEqual(PLATFORM_STOCK_TENANT_SLUG, "impronta");
});

test("the stock folder is distinct from the other system folders", () => {
  for (const other of [BRANDING_FOLDER, LIFESTYLE_FOLDER]) {
    assert.notEqual(STOCK_FOLDER.systemKey, other.systemKey);
    assert.notEqual(STOCK_FOLDER.color, other.color);
  }
});

test("an image is shared only once it is FILED, not merely uploaded", async () => {
  // The tenant exists and has assets, but no Stock folder: nothing is shared.
  const { client } = fakeDb({ stockTenantId: "t-stock", folderId: null, assets: [ASSET] });
  assert.deepEqual(await queryPlatformStock(client), []);
});

test("no stock tenant means an empty shelf, not an exception", async () => {
  const { client } = fakeDb({ stockTenantId: null });
  assert.deepEqual(await queryPlatformStock(client), []);
  assert.equal(await resolveStockTenantId(client), null);
});

test("an empty folder means an empty shelf", async () => {
  const { client } = fakeDb({ stockTenantId: "t-stock", folderId: "f1", assetIds: [] });
  assert.deepEqual(await queryPlatformStock(client), []);
});

test("filed images come back with what a caller needs to render them", async () => {
  const { client, calls } = fakeDb({
    stockTenantId: "t-stock",
    folderId: "f1",
    assetIds: ["a1"],
    assets: [ASSET],
  });
  const rows = await queryPlatformStock(client);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: "a1",
    storagePath: "tenant/t/stock/x.jpg",
    bucketId: "media-public",
    width: 1600,
    height: 900,
    altText: "A studio meeting between three people at a table.",
    category: "editorial",
  });
  // The asset read is scoped to the stock tenant and excludes deleted rows —
  // this query must never be able to reach another tenant's library.
  const assetCall = calls.find((c) => c.table === "media_assets");
  assert.equal(assetCall?.filters.tenant_id, "t-stock");
  assert.equal(assetCall?.filters.deleted_at, null);
});

test("category filtering only returns that category", async () => {
  const { client } = fakeDb({
    stockTenantId: "t-stock", folderId: "f1", assetIds: ["a1"], assets: [ASSET],
  });
  assert.equal((await queryPlatformStock(client, { category: "editorial" })).length, 1);
  assert.equal((await queryPlatformStock(client, { category: "event" })).length, 0);
});

test("a broken shared library never takes a tenant's Media page down", async () => {
  const exploding = { from() { throw new Error("stock backend is down"); } };
  assert.deepEqual(await queryPlatformStock(exploding as never), []);
});
