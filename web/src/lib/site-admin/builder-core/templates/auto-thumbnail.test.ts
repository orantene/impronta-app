/**
 * auto-thumbnail.test.ts (A8) — unit tests for the PURE decision logic and the
 * best-effort failure contract of the flag-gated auto-thumbnail capture.
 *
 * Deliberately NOT a headless-browser test: `renderTemplatePreviewToPng`
 * degrades to a no-op (returns null) when the optional headless module is
 * absent, which is exactly the runtime reality, so these tests exercise the
 * decision + swallow-failure contract without any real browser.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-core/templates/auto-thumbnail.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  shouldAutoCaptureThumbnail,
  maybeAutoCaptureThumbnail,
  templatePreviewUrlForRow,
  type AutoThumbnailDecisionRow,
} from "./auto-thumbnail";
import type { BuilderTemplateRow } from "./registry-rows";

// ── shouldAutoCaptureThumbnail (pure predicate) ───────────────────────────────

const renderable: AutoThumbnailDecisionRow = {
  thumbnail_asset_id: null,
  builder_tree: [{ id: "n1" }],
};

describe("shouldAutoCaptureThumbnail", () => {
  it("returns FALSE when the flag is OFF (even with a perfect row)", () => {
    assert.equal(shouldAutoCaptureThumbnail(renderable, false), false);
  });

  it("returns TRUE when flag on + no thumbnail + renderable tree", () => {
    assert.equal(shouldAutoCaptureThumbnail(renderable, true), true);
  });

  it("returns FALSE when a thumbnail already exists", () => {
    assert.equal(
      shouldAutoCaptureThumbnail(
        { thumbnail_asset_id: "asset-1", builder_tree: [{ id: "n1" }] },
        true,
      ),
      false,
    );
  });

  it("returns FALSE for an empty tree", () => {
    assert.equal(
      shouldAutoCaptureThumbnail(
        { thumbnail_asset_id: null, builder_tree: [] },
        true,
      ),
      false,
    );
  });

  it("returns FALSE for a non-array tree", () => {
    assert.equal(
      shouldAutoCaptureThumbnail(
        { thumbnail_asset_id: null, builder_tree: null },
        true,
      ),
      false,
    );
  });
});

// ── templatePreviewUrlForRow ──────────────────────────────────────────────────

describe("templatePreviewUrlForRow", () => {
  it("builds a relative db-template preview path when origin is null", () => {
    assert.equal(
      templatePreviewUrlForRow({ id: "tmpl-1" }, null),
      "/template-preview/tmpl-1?kind=db-template",
    );
  });

  it("prefixes the absolute origin, trimming a trailing slash", () => {
    assert.equal(
      templatePreviewUrlForRow({ id: "tmpl-1" }, "https://x.test/"),
      "https://x.test/template-preview/tmpl-1?kind=db-template",
    );
  });
});

// ── maybeAutoCaptureThumbnail (entry point) ───────────────────────────────────

function makeRow(overrides: Partial<BuilderTemplateRow> = {}): BuilderTemplateRow {
  return {
    id: "tmpl-1",
    kind: "page-design",
    status: "published",
    target_context: "both",
    title: "Editorial Dark",
    slug: "editorial-dark",
    description: null,
    category: "portfolio",
    gallery_tab: "templates",
    tags: [],
    thumbnail_asset_id: null,
    hero_asset_id: null,
    required_plan: "free",
    required_talent_tier: null,
    builder_tree: [{ id: "n1" } as never],
    theme_tokens: null,
    data_binding_requirements: [],
    schema_version: 1,
    version: 2,
    published_at: "2026-06-18T00:00:00.000Z",
    source_tenant_id: "tenant-1",
    created_by: "user-1",
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
    ...overrides,
  } as BuilderTemplateRow;
}

/** A Supabase stub whose every used method throws — proves nothing escapes. */
const explodingClient = {
  storage: {
    from() {
      throw new Error("storage blew up");
    },
  },
  from() {
    throw new Error("db blew up");
  },
} as unknown as SupabaseClient;

describe("maybeAutoCaptureThumbnail", () => {
  it("flag OFF → pure pass-through, returns the SAME row reference (no I/O)", async () => {
    delete process.env.BUILDER_AUTO_THUMBNAIL_ENABLED;
    const row = makeRow();
    const result = await maybeAutoCaptureThumbnail(explodingClient, row, {
      createdBy: "user-1",
    });
    // Same reference proves the function short-circuited before touching the
    // (exploding) client at all.
    assert.equal(result, row);
  });

  it("flag ON but capture unavailable → returns original row unchanged, never throws", async () => {
    process.env.BUILDER_AUTO_THUMBNAIL_ENABLED = "1";
    try {
      const row = makeRow();
      // renderTemplatePreviewToPng degrades to null (no headless module), so the
      // helper returns before any storage/db write.
      const result = await maybeAutoCaptureThumbnail(explodingClient, row, {
        createdBy: "user-1",
      });
      assert.equal(result, row);
      assert.equal(result.thumbnail_asset_id, null);
    } finally {
      delete process.env.BUILDER_AUTO_THUMBNAIL_ENABLED;
    }
  });

  it("flag ON + row already has a thumbnail → pass-through, no capture attempt", async () => {
    process.env.BUILDER_AUTO_THUMBNAIL_ENABLED = "true";
    try {
      const row = makeRow({ thumbnail_asset_id: "existing-asset" });
      const result = await maybeAutoCaptureThumbnail(explodingClient, row, {
        createdBy: "user-1",
      });
      assert.equal(result, row);
    } finally {
      delete process.env.BUILDER_AUTO_THUMBNAIL_ENABLED;
    }
  });

  it("flag ON + empty tree → pass-through, no capture attempt", async () => {
    process.env.BUILDER_AUTO_THUMBNAIL_ENABLED = "1";
    try {
      const row = makeRow({ builder_tree: [] });
      const result = await maybeAutoCaptureThumbnail(explodingClient, row, {
        createdBy: "user-1",
      });
      assert.equal(result, row);
    } finally {
      delete process.env.BUILDER_AUTO_THUMBNAIL_ENABLED;
    }
  });
});
