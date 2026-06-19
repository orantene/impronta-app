/**
 * template-export.test.ts (A3) — unit tests for toPortableTemplateJson.
 *
 * Asserts:
 *   1. All PORTABLE_TEMPLATE_KEYS are present in the output.
 *   2. Non-portable fields (id, status, version, created_by, published_at,
 *      rollout_percentage, tenant_allowlist, tenant_denylist) are absent.
 *   3. Optional `tree` arg overrides row.builder_tree.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  toPortableTemplateJson,
  PORTABLE_TEMPLATE_KEYS,
} from "./template-export";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";

// ── Minimal stub row ──────────────────────────────────────────────────────────

const STUB_ROW: BuilderTemplateRow = {
  id: "row-id-123",
  kind: "starter_kit",
  status: "published",
  target_context: "workspace",
  title: "My Starter",
  slug: "my-starter",
  description: "A great starter.",
  category: "Editorial",
  gallery_tab: "page_templates",
  tags: ["editorial", "minimal"],
  thumbnail_asset_id: null,
  hero_asset_id: null,
  required_plan: "studio",
  required_talent_tier: null,
  builder_tree: [{ id: "node-1", type: "section", children: [] } as never],
  theme_tokens: { "--color-accent": "#FF0000" },
  data_binding_requirements: [],
  schema_version: 3,
  version: 7,
  published_at: "2026-01-15T10:00:00Z",
  source_tenant_id: "tenant-abc",
  created_by: "user-xyz",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
  rollout_percentage: 50,
  tenant_allowlist: ["tenant-1", "tenant-2"],
  tenant_denylist: ["tenant-3"],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("toPortableTemplateJson", () => {
  it("includes all portable keys", () => {
    const result = toPortableTemplateJson(STUB_ROW);
    const resultKeys = Object.keys(result);

    for (const key of PORTABLE_TEMPLATE_KEYS) {
      assert.ok(
        resultKeys.includes(key),
        `Expected portable key "${key}" to be present in result`,
      );
    }
  });

  it("excludes non-portable fields", () => {
    const result = toPortableTemplateJson(STUB_ROW) as unknown as Record<string, unknown>;

    const excluded = [
      "id",
      "status",
      "version",
      "created_by",
      "published_at",
      "rollout_percentage",
      "tenant_allowlist",
      "tenant_denylist",
      "created_at",
      "updated_at",
      "source_tenant_id",
      "thumbnail_asset_id",
      "hero_asset_id",
      "data_binding_requirements",
      "required_talent_tier",
    ];

    for (const key of excluded) {
      assert.ok(
        !(key in result),
        `Expected non-portable key "${key}" to be absent from result`,
      );
    }
  });

  it("result has EXACTLY the portable keys (no extras)", () => {
    const result = toPortableTemplateJson(STUB_ROW);
    const resultKeys = new Set(Object.keys(result));
    const expected = new Set<string>(PORTABLE_TEMPLATE_KEYS);

    for (const key of resultKeys) {
      assert.ok(
        expected.has(key),
        `Unexpected extra key "${key}" in portable output`,
      );
    }

    assert.equal(
      resultKeys.size,
      expected.size,
      "Portable output has wrong number of keys",
    );
  });

  it("preserves correct field values", () => {
    const result = toPortableTemplateJson(STUB_ROW);

    assert.equal(result.kind, "starter_kit");
    assert.equal(result.title, "My Starter");
    assert.equal(result.slug, "my-starter");
    assert.equal(result.description, "A great starter.");
    assert.equal(result.category, "Editorial");
    assert.equal(result.gallery_tab, "page_templates");
    assert.equal(result.target_context, "workspace");
    assert.equal(result.required_plan, "studio");
    assert.deepEqual(result.tags, ["editorial", "minimal"]);
    assert.deepEqual(result.theme_tokens, { "--color-accent": "#FF0000" });
    assert.equal(result.schema_version, 3);
  });

  it("optional tree arg overrides row.builder_tree", () => {
    const overrideTree = [{ id: "override-node", type: "container", children: [] } as never];
    const result = toPortableTemplateJson(STUB_ROW, overrideTree);

    assert.deepEqual(result.builder_tree, overrideTree);
  });

  it("uses row.builder_tree when no tree override supplied", () => {
    const result = toPortableTemplateJson(STUB_ROW);
    assert.deepEqual(result.builder_tree, STUB_ROW.builder_tree);
  });

  it("handles null/undefined description and theme_tokens gracefully", () => {
    const row: BuilderTemplateRow = {
      ...STUB_ROW,
      description: null,
      theme_tokens: null,
    };
    const result = toPortableTemplateJson(row);
    assert.equal(result.description, null);
    assert.equal(result.theme_tokens, null);
  });

  it("returns a fresh tags array (not a reference to row.tags)", () => {
    const result = toPortableTemplateJson(STUB_ROW);
    assert.notEqual(result.tags, STUB_ROW.tags);
    assert.deepEqual(result.tags, STUB_ROW.tags);
  });
});
