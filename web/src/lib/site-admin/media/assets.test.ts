import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getTenantMediaAsset,
  listBuilderImageMediaAssets,
  listTenantMediaLibrary,
} from "./assets";
import { MEDIA_IMAGE_MAX_BYTES, validateImageUpload } from "./validation";

type FakeRow = Record<string, unknown>;

class FakeQuery {
  private filters: Array<(row: FakeRow) => boolean> = [];
  private limitCount: number | null = null;

  constructor(private rows: FakeRow[]) {}

  select() {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    const rows = this.applyFilters();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then(
    resolve: (value: { data: FakeRow[]; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    return Promise.resolve({ data: this.applyFilters(), error: null }).then(
      resolve,
      reject,
    );
  }

  private applyFilters() {
    const rows = this.filters.reduce(
      (current, filter) => current.filter(filter),
      this.rows,
    );
    return this.limitCount == null ? rows : rows.slice(0, this.limitCount);
  }
}

function fakeSupabase(rows: FakeRow[], folders: FakeRow[] = []): SupabaseClient {
  return {
    from(table: string) {
      if (table === "media_assets") return new FakeQuery(rows);
      if (table === "media_folders") return new FakeQuery(folders);
      assert.fail(`Unexpected table ${table}`);
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl: `https://cdn.example.test/storage/${bucket}/${path}`,
              },
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

function row(overrides: Partial<FakeRow>): FakeRow {
  return {
    id: "asset-a",
    tenant_id: "tenant-a",
    owner_talent_profile_id: null,
    variant_kind: "original",
    storage_path: "tenant/tenant-a/library/a.webp",
    bucket_id: "media-public",
    public_url: null,
    width: 1200,
    height: 1600,
    file_size: 1200,
    file_size_bytes: 1200,
    byte_size: 1200,
    mime: "image/webp",
    mime_type: "image/webp",
    alt: "Tenant A",
    created_at: "2026-06-01T00:00:00.000Z",
    metadata: { source: "test" },
    purpose: "cms",
    approval_state: "approved",
    deleted_at: null,
    ...overrides,
  };
}

describe("site-admin media assets", () => {
  it("rejects non-image and oversized image uploads", () => {
    assert.deepEqual(validateImageUpload({ mime: "text/html", byteSize: 120 }), {
      ok: false,
      status: 415,
      error: 'Unsupported image type "text/html". Accepted: JPEG, PNG, WebP, GIF.',
    });
    const tooLarge = validateImageUpload({
      mime: "image/png",
      byteSize: MEDIA_IMAGE_MAX_BYTES + 1,
    });
    assert.equal(tooLarge.ok, false);
    if (!tooLarge.ok) assert.equal(tooLarge.status, 413);
  });

  it("lists only the requested tenant media library rows with album membership", async () => {
    const supabase = fakeSupabase(
      [
        row({
          id: "asset-a",
          tenant_id: "tenant-a",
          owner_talent_profile_id: "talent-a",
          purpose: null,
          alt: "A",
        }),
        row({ id: "asset-b", tenant_id: "tenant-b", alt: "B" }),
        row({ id: "asset-deleted", tenant_id: "tenant-a", deleted_at: "x" }),
        row({
          id: "asset-video",
          tenant_id: "tenant-a",
          storage_path: "tenant/tenant-a/library/clip.mp4",
          mime: "video/mp4",
          mime_type: "video/mp4",
        }),
      ],
      [
        {
          id: "folder-a",
          tenant_id: "tenant-a",
          name: "Campaign",
          color: "#888888",
          media_folder_items: [{ asset_id: "asset-a" }],
        },
      ],
    );

    const items = await listTenantMediaLibrary(supabase, "tenant-a");

    assert.deepEqual(items.map((item) => item.id), ["asset-a"]);
    assert.equal(items[0]?.tenantId, "tenant-a");
    assert.equal(items[0]?.alt, "A");
    assert.deepEqual(items[0]?.folderIds, ["folder-a"]);
  });

  it("does not select another tenant asset by id", async () => {
    const supabase = fakeSupabase([
      row({ id: "asset-a", tenant_id: "tenant-a" }),
      row({ id: "asset-b", tenant_id: "tenant-b" }),
    ]);

    const item = await getTenantMediaAsset(supabase, "tenant-a", "asset-b");

    assert.equal(item, null);
  });

  it("resolves builder image assets inside the requested tenant only", async () => {
    const supabase = fakeSupabase([
      row({ id: "asset-a", tenant_id: "tenant-a" }),
      row({ id: "asset-b", tenant_id: "tenant-b" }),
    ]);

    const assets = await listBuilderImageMediaAssets(supabase, "tenant-a", [
      "asset-a",
      "asset-b",
    ]);

    assert.deepEqual(assets.map((asset) => asset.id), ["asset-a"]);
    assert.equal(assets[0]?.publicUrl.includes("tenant-a/library/a.webp"), true);
  });
});
