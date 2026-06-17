import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getTenantMediaAsset,
  listBuilderImageMediaAssets,
  listTenantMediaLibrary,
  normalizeTagInput,
  updateTenantMediaAssetTags,
} from "./assets";
import { MEDIA_IMAGE_MAX_BYTES, validateImageUpload } from "./validation";

type FakeRow = Record<string, unknown>;

class FakeQuery {
  private filters: Array<(row: FakeRow) => boolean> = [];
  private limitCount: number | null = null;
  private pendingPatch: FakeRow | null = null;

  constructor(private rows: FakeRow[]) {}

  select() {
    return this;
  }

  update(patch: FakeRow) {
    this.pendingPatch = patch;
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
    const rows = this.applyMutation();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then(
    resolve: (value: { data: FakeRow[]; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    return Promise.resolve({ data: this.applyMutation(), error: null }).then(
      resolve,
      reject,
    );
  }

  /** Apply the pending UPDATE patch to matched rows (mutating the backing
   *  store so a follow-up read sees it), then return them. */
  private applyMutation() {
    const matched = this.applyFilters();
    if (this.pendingPatch) {
      for (const row of matched) Object.assign(row, this.pendingPatch);
    }
    return matched;
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
    asset_kind: "image",
    tags: [],
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

  it("lists the requested tenant rows with album membership; only own tenant", async () => {
    const supabase = fakeSupabase(
      [
        row({
          id: "asset-a",
          tenant_id: "tenant-a",
          owner_talent_profile_id: "talent-a",
          purpose: null,
          alt: "A",
          tags: ["campaign", "hero"],
        }),
        row({ id: "asset-b", tenant_id: "tenant-b", alt: "B" }),
        row({ id: "asset-deleted", tenant_id: "tenant-a", deleted_at: "x" }),
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
    assert.equal(items[0]?.assetKind, "image");
    assert.deepEqual(items[0]?.tags, ["campaign", "hero"]);
    assert.deepEqual(items[0]?.folderIds, ["folder-a"]);
  });

  it("MEDIA-1: surfaces video + document assets (not just images), excludes SVG", async () => {
    const supabase = fakeSupabase([
      row({ id: "img", tenant_id: "tenant-a" }),
      row({
        id: "vid",
        tenant_id: "tenant-a",
        asset_kind: "video",
        storage_path: "tenant/tenant-a/videos/clip.mp4",
        mime: "video/mp4",
        mime_type: "video/mp4",
      }),
      row({
        id: "doc",
        tenant_id: "tenant-a",
        asset_kind: "document",
        storage_path: "tenant/tenant-a/documents/deck.pdf",
        mime: "application/pdf",
        mime_type: "application/pdf",
      }),
      // SVG stays excluded for XSS — kind resolves to null and is dropped.
      row({
        id: "svg",
        tenant_id: "tenant-a",
        asset_kind: null,
        storage_path: "tenant/tenant-a/library/logo.svg",
        mime: "image/svg+xml",
        mime_type: "image/svg+xml",
      }),
    ]);

    const items = await listTenantMediaLibrary(supabase, "tenant-a");
    const byId = new Map(items.map((item) => [item.id, item]));

    assert.deepEqual(items.map((item) => item.id).sort(), ["doc", "img", "vid"]);
    assert.equal(byId.get("vid")?.assetKind, "video");
    assert.equal(byId.get("doc")?.assetKind, "document");
    assert.equal(byId.get("img")?.assetKind, "image");
  });

  it("MEDIA-1: infers kind from MIME when asset_kind is absent (pre-migration row)", async () => {
    const supabase = fakeSupabase([
      // Legacy row with no asset_kind column written yet — falls back to MIME.
      row({
        id: "legacy-vid",
        tenant_id: "tenant-a",
        asset_kind: undefined,
        storage_path: "tenant/tenant-a/videos/old.mov",
        mime: "video/quicktime",
        mime_type: "video/quicktime",
      }),
    ]);

    const items = await listTenantMediaLibrary(supabase, "tenant-a");
    assert.equal(items.length, 1);
    assert.equal(items[0]?.assetKind, "video");
  });

  it("MEDIA-1: listBuilderImageMediaAssets stays image-only (drops video/doc)", async () => {
    const supabase = fakeSupabase([
      row({ id: "img", tenant_id: "tenant-a" }),
      row({
        id: "vid",
        tenant_id: "tenant-a",
        asset_kind: "video",
        storage_path: "tenant/tenant-a/videos/clip.mp4",
        mime: "video/mp4",
        mime_type: "video/mp4",
      }),
    ]);

    const assets = await listBuilderImageMediaAssets(supabase, "tenant-a", [
      "img",
      "vid",
    ]);
    assert.deepEqual(assets.map((asset) => asset.id), ["img"]);
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

  it("MEDIA-1: normalizeTagInput trims, lowercases, dedupes, drops empties, caps", () => {
    assert.deepEqual(
      normalizeTagInput([" Campaign ", "campaign", "HERO", "", "  "]),
      ["campaign", "hero"],
    );
    const many = Array.from({ length: 40 }, (_, i) => `tag-${i}`);
    assert.equal(normalizeTagInput(many).length, 24);
  });

  it("MEDIA-1: updateTenantMediaAssetTags persists normalized tags for own tenant", async () => {
    const supabase = fakeSupabase([
      row({ id: "asset-a", tenant_id: "tenant-a", tags: ["old"] }),
      row({ id: "asset-b", tenant_id: "tenant-b", tags: [] }),
    ]);

    const updated = await updateTenantMediaAssetTags({
      supabase,
      tenantId: "tenant-a",
      assetId: "asset-a",
      tags: [" Studio ", "studio", "EDITORIAL"],
    });

    assert.ok(updated);
    assert.deepEqual(updated?.tags, ["studio", "editorial"]);

    // Cross-tenant write is scoped out — no row matched, returns null.
    const crossTenant = await updateTenantMediaAssetTags({
      supabase,
      tenantId: "tenant-a",
      assetId: "asset-b",
      tags: ["x"],
    });
    assert.equal(crossTenant, null);
  });
});
