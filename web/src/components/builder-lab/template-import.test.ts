/**
 * template-import.test.ts (A4) — unit tests for parsePortableTemplate and
 * buildImportDraftInput.
 *
 * Asserts:
 *   1. Valid PortableTemplate JSON parses successfully.
 *   2. Missing required fields → rejected with a clear reason.
 *   3. Unknown `kind` → rejected with a clear reason.
 *   4. Unknown `gallery_tab` → rejected with a clear reason.
 *   5. Oversized builder_tree → rejected with a clear reason.
 *   6. Round-trip: A3's toPortableTemplateJson output parses back cleanly
 *      into a CreateTemplateDraftInput via buildImportDraftInput.
 *   7. buildImportDraftInput maps parsed fields + newSlug correctly.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePortableTemplate,
  buildImportDraftInput,
  MAX_IMPORT_TREE_NODES,
} from "./template-import";
import { toPortableTemplateJson } from "./template-export";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal valid portable template JSON (mirrors A3's export output). */
const VALID_PORTABLE: Record<string, unknown> = {
  kind: "starter_kit",
  title: "My Starter",
  slug: "my-starter",
  description: "A great starter.",
  category: "Editorial",
  gallery_tab: "page_templates",
  target_context: "workspace",
  required_plan: "studio",
  tags: ["editorial", "minimal"],
  theme_tokens: { "--color-accent": "#FF0000" },
  builder_tree: [{ id: "node-1", type: "section", children: [] }],
  schema_version: 1,
};

/** Full BuilderTemplateRow stub used for the round-trip test. */
const STUB_ROW: BuilderTemplateRow = {
  id: "row-id-123",
  kind: "starter_kit",
  status: "published",
  target_context: "workspace",
  title: "Round-trip Starter",
  slug: "round-trip-starter",
  description: "Tests that A3 export ↔ A4 import round-trip correctly.",
  category: "Round-trip",
  gallery_tab: "page_templates",
  tags: ["rt", "test"],
  thumbnail_asset_id: null,
  hero_asset_id: null,
  required_plan: "free",
  required_talent_tier: null,
  builder_tree: [
    { id: "node-a", type: "section", children: [] } as never,
    { id: "node-b", type: "container", children: [] } as never,
  ],
  theme_tokens: { "--color-bg": "#121212" },
  data_binding_requirements: [],
  schema_version: 1,
  version: 3,
  published_at: "2026-01-20T12:00:00Z",
  source_tenant_id: "tenant-round-trip",
  created_by: "user-rt",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-20T12:00:00Z",
  rollout_percentage: 100,
  tenant_allowlist: [],
  tenant_denylist: [],
};

// ── parsePortableTemplate ─────────────────────────────────────────────────────

describe("parsePortableTemplate", () => {
  it("accepts a valid portable template", () => {
    const result = parsePortableTemplate(VALID_PORTABLE);
    assert.ok(result.ok, `Expected ok=true, got error: ${!result.ok && result.error}`);
    if (result.ok) {
      assert.equal(result.data.kind, "starter_kit");
      assert.equal(result.data.title, "My Starter");
      assert.equal(result.data.slug, "my-starter");
    }
  });

  it("rejects a non-object (null)", () => {
    const result = parsePortableTemplate(null);
    assert.ok(!result.ok);
    assert.ok(result.error.length > 0, "Should have a rejection reason");
  });

  it("rejects a non-object (string)", () => {
    const result = parsePortableTemplate("not-an-object");
    assert.ok(!result.ok);
  });

  it("rejects when required field `title` is missing", () => {
    const { title: _t, ...noTitle } = VALID_PORTABLE;
    const result = parsePortableTemplate(noTitle);
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("title"),
      `Expected mention of 'title' in error, got: "${result.error}"`,
    );
  });

  it("rejects when required field `kind` is missing", () => {
    const { kind: _k, ...noKind } = VALID_PORTABLE;
    const result = parsePortableTemplate(noKind);
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("kind"),
      `Expected mention of 'kind' in error, got: "${result.error}"`,
    );
  });

  it("rejects when required field `category` is missing", () => {
    const { category: _c, ...noCategory } = VALID_PORTABLE;
    const result = parsePortableTemplate(noCategory);
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("category"),
      `Expected mention of 'category' in error, got: "${result.error}"`,
    );
  });

  it("rejects when required field `gallery_tab` is missing", () => {
    const { gallery_tab: _g, ...noTab } = VALID_PORTABLE;
    const result = parsePortableTemplate(noTab);
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("gallery_tab"),
      `Expected mention of 'gallery_tab' in error, got: "${result.error}"`,
    );
  });

  it("rejects an unknown `kind` with a clear reason", () => {
    const result = parsePortableTemplate({ ...VALID_PORTABLE, kind: "unknown_kind" });
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("kind") || result.error.includes("unknown_kind"),
      `Expected rejection to mention 'kind' or 'unknown_kind', got: "${result.error}"`,
    );
  });

  it("rejects an unknown `gallery_tab` with a clear reason", () => {
    const result = parsePortableTemplate({
      ...VALID_PORTABLE,
      gallery_tab: "not_a_tab",
    });
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("gallery_tab") || result.error.includes("not_a_tab"),
      `Expected rejection to mention 'gallery_tab' or 'not_a_tab', got: "${result.error}"`,
    );
  });

  it("rejects an oversized builder_tree", () => {
    const hugeTree = Array.from({ length: MAX_IMPORT_TREE_NODES + 1 }, (_, i) => ({
      id: `node-${i}`,
      type: "section",
      children: [],
    }));
    const result = parsePortableTemplate({ ...VALID_PORTABLE, builder_tree: hugeTree });
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("builder_tree") ||
        result.error.includes("too large") ||
        result.error.includes(String(MAX_IMPORT_TREE_NODES + 1)),
      `Expected oversized-tree rejection, got: "${result.error}"`,
    );
  });

  it("accepts a builder_tree exactly at the limit", () => {
    const bigTree = Array.from({ length: MAX_IMPORT_TREE_NODES }, (_, i) => ({
      id: `node-${i}`,
      type: "section",
      children: [],
    }));
    const result = parsePortableTemplate({ ...VALID_PORTABLE, builder_tree: bigTree });
    assert.ok(result.ok, `Expected ok=true at limit, got: ${!result.ok && result.error}`);
  });

  it("accepts null description", () => {
    const result = parsePortableTemplate({ ...VALID_PORTABLE, description: null });
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.description, null);
  });

  it("accepts null theme_tokens", () => {
    const result = parsePortableTemplate({ ...VALID_PORTABLE, theme_tokens: null });
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.theme_tokens, null);
  });

  it("rejects an empty title string", () => {
    const result = parsePortableTemplate({ ...VALID_PORTABLE, title: "" });
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("title"),
      `Expected mention of 'title' in error, got: "${result.error}"`,
    );
  });

  it("rejects empty category string", () => {
    const result = parsePortableTemplate({ ...VALID_PORTABLE, category: "" });
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("category"),
      `Expected mention of 'category' in error, got: "${result.error}"`,
    );
  });

  it("rejects empty slug string", () => {
    const result = parsePortableTemplate({ ...VALID_PORTABLE, slug: "" });
    assert.ok(!result.ok);
    assert.ok(
      result.error.includes("slug"),
      `Expected mention of 'slug' in error, got: "${result.error}"`,
    );
  });

  it("returns a clear rejection reason (not a generic 'parse failed')", () => {
    const result = parsePortableTemplate({ ...VALID_PORTABLE, kind: "bad_kind" });
    assert.ok(!result.ok);
    // The reason should include something specific, not just 'parse failed'
    assert.ok(result.error.length > 10, "Rejection reason too short/generic");
  });
});

// ── buildImportDraftInput ─────────────────────────────────────────────────────

describe("buildImportDraftInput", () => {
  it("maps parsed fields into CreateTemplateDraftInput with the supplied newSlug", () => {
    const parseResult = parsePortableTemplate(VALID_PORTABLE);
    assert.ok(parseResult.ok);
    if (!parseResult.ok) return;

    const newSlug = "my-starter-copy";
    const input = buildImportDraftInput(parseResult.data, newSlug);

    assert.equal(input.kind, "starter_kit");
    assert.equal(input.title, "My Starter");
    assert.equal(input.slug, newSlug, "slug should be the minted newSlug, not the original");
    assert.equal(input.description, "A great starter.");
    assert.equal(input.category, "Editorial");
    assert.equal(input.gallery_tab, "page_templates");
    assert.equal(input.target_context, "workspace");
    assert.equal(input.required_plan, "studio");
    assert.deepEqual(input.tags, ["editorial", "minimal"]);
    assert.deepEqual(input.theme_tokens, { "--color-accent": "#FF0000" });
    assert.ok(Array.isArray(input.builder_tree));
  });

  it("produces a fresh tags array (not a reference to parsed.tags)", () => {
    const parseResult = parsePortableTemplate(VALID_PORTABLE);
    assert.ok(parseResult.ok);
    if (!parseResult.ok) return;

    const input = buildImportDraftInput(parseResult.data, "slug");
    assert.notEqual(input.tags, parseResult.data.tags);
    assert.deepEqual(input.tags, parseResult.data.tags);
  });

  it("maps null description to null", () => {
    const parseResult = parsePortableTemplate({ ...VALID_PORTABLE, description: null });
    assert.ok(parseResult.ok);
    if (!parseResult.ok) return;

    const input = buildImportDraftInput(parseResult.data, "slug");
    assert.equal(input.description, null);
  });
});

// ── Round-trip: A3 export → A4 import ────────────────────────────────────────

describe("A3 export → A4 import round-trip", () => {
  it("toPortableTemplateJson output parses cleanly via parsePortableTemplate", () => {
    const portable = toPortableTemplateJson(STUB_ROW);
    // Simulate JSON serialization (as if the file was downloaded and re-read)
    const json: unknown = JSON.parse(JSON.stringify(portable));

    const result = parsePortableTemplate(json);
    assert.ok(
      result.ok,
      `Round-trip failed: ${!result.ok ? result.error : ""}`,
    );
  });

  it("round-trip preserves all portable fields correctly", () => {
    const portable = toPortableTemplateJson(STUB_ROW);
    const json: unknown = JSON.parse(JSON.stringify(portable));
    const result = parsePortableTemplate(json);

    assert.ok(result.ok);
    if (!result.ok) return;

    assert.equal(result.data.kind, STUB_ROW.kind);
    assert.equal(result.data.title, STUB_ROW.title);
    assert.equal(result.data.slug, STUB_ROW.slug);
    assert.equal(result.data.description, STUB_ROW.description);
    assert.equal(result.data.category, STUB_ROW.category);
    assert.equal(result.data.gallery_tab, STUB_ROW.gallery_tab);
    assert.equal(result.data.target_context, STUB_ROW.target_context);
    assert.equal(result.data.required_plan, STUB_ROW.required_plan);
    assert.deepEqual(result.data.tags, STUB_ROW.tags);
    assert.deepEqual(result.data.theme_tokens, STUB_ROW.theme_tokens);
    assert.equal(result.data.schema_version, STUB_ROW.schema_version);
    assert.equal(result.data.builder_tree.length, STUB_ROW.builder_tree.length);
  });

  it("round-trip non-portable fields (id, status, version, …) are absent from parsed output", () => {
    const portable = toPortableTemplateJson(STUB_ROW);
    const json: unknown = JSON.parse(JSON.stringify(portable));
    const result = parsePortableTemplate(json);

    assert.ok(result.ok);
    if (!result.ok) return;

    const data = result.data as unknown as Record<string, unknown>;
    const nonPortable = ["id", "status", "version", "created_by", "published_at",
      "rollout_percentage", "tenant_allowlist", "tenant_denylist", "created_at",
      "updated_at", "source_tenant_id", "data_binding_requirements"];

    for (const key of nonPortable) {
      assert.ok(!(key in data), `Non-portable field "${key}" leaked into parsed output`);
    }
  });

  it("round-trip → buildImportDraftInput produces a valid CreateTemplateDraftInput", () => {
    const portable = toPortableTemplateJson(STUB_ROW);
    const json: unknown = JSON.parse(JSON.stringify(portable));
    const result = parsePortableTemplate(json);

    assert.ok(result.ok);
    if (!result.ok) return;

    // Simulate collision: slug already taken → minted as -copy
    const input = buildImportDraftInput(result.data, "round-trip-starter-copy");

    assert.equal(input.kind, STUB_ROW.kind);
    assert.equal(input.title, STUB_ROW.title);
    assert.equal(input.slug, "round-trip-starter-copy");
    assert.equal(input.description, STUB_ROW.description);
    assert.equal(input.category, STUB_ROW.category);
    assert.equal(input.gallery_tab, STUB_ROW.gallery_tab);
    assert.equal(input.required_plan, STUB_ROW.required_plan);
    assert.deepEqual(input.tags, STUB_ROW.tags);
    assert.deepEqual(input.theme_tokens, STUB_ROW.theme_tokens);
    assert.equal(
      (input.builder_tree ?? []).length,
      STUB_ROW.builder_tree.length,
    );
  });
});
