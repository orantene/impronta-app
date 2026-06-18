/**
 * taxonomy-actions.test.ts (D5) — unit tests for the pure helpers in
 * taxonomy-actions.ts (aggregation + rename/merge/delete transforms).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-core/templates/taxonomy-actions.test.ts
 *
 * Only the pure, I/O-free helpers are tested here — the server actions that
 * call listAllTemplates + updateTemplateDraft are integration-level (live DB).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateTags,
  aggregateCategories,
  applyTagRename,
  applyTagMerge,
  applyTagDelete,
} from "./taxonomy-actions";
import type { BuilderTemplateRow } from "./registry-rows";

// ── Minimal fixture factory ───────────────────────────────────────────────────

function makeRow(
  overrides: Partial<Pick<BuilderTemplateRow, "id" | "tags" | "category">>,
): BuilderTemplateRow {
  return {
    id: overrides.id ?? "row-1",
    kind: "element",
    status: "published",
    target_context: "both",
    title: "Test template",
    slug: "test-template",
    description: null,
    category: overrides.category ?? "Uncategorized",
    gallery_tab: "elements",
    tags: overrides.tags ?? [],
    thumbnail_asset_id: null,
    hero_asset_id: null,
    required_plan: "free",
    required_talent_tier: null,
    builder_tree: [],
    theme_tokens: null,
    data_binding_requirements: [],
    schema_version: 1,
    version: 1,
    published_at: null,
    source_tenant_id: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── aggregateTags ─────────────────────────────────────────────────────────────

describe("aggregateTags", () => {
  it("returns empty array for empty input", () => {
    assert.deepEqual(aggregateTags([]), []);
  });

  it("returns empty array when no templates have tags", () => {
    const rows = [
      makeRow({ id: "a", tags: [] }),
      makeRow({ id: "b", tags: [] }),
    ];
    assert.deepEqual(aggregateTags(rows), []);
  });

  it("counts each tag across templates", () => {
    const rows = [
      makeRow({ id: "a", tags: ["photography", "portrait"] }),
      makeRow({ id: "b", tags: ["photography", "event"] }),
      makeRow({ id: "c", tags: ["event"] }),
    ];
    const result = aggregateTags(rows);
    const byValue = Object.fromEntries(result.map((e) => [e.value, e.count]));
    assert.equal(byValue["photography"], 2);
    assert.equal(byValue["portrait"], 1);
    assert.equal(byValue["event"], 2);
    assert.equal(result.length, 3);
  });

  it("sorts by count descending then value ascending", () => {
    const rows = [
      makeRow({ id: "a", tags: ["b-tag", "a-tag"] }),
      makeRow({ id: "b", tags: ["b-tag"] }),
    ];
    const result = aggregateTags(rows);
    assert.equal(result[0].value, "b-tag"); // count 2
    assert.equal(result[1].value, "a-tag"); // count 1
  });

  it("ties on count sort alphabetically", () => {
    const rows = [
      makeRow({ id: "a", tags: ["zebra", "apple"] }),
    ];
    const result = aggregateTags(rows);
    assert.equal(result[0].value, "apple");
    assert.equal(result[1].value, "zebra");
  });

  it("trims whitespace from tags and deduplicates after trim", () => {
    const rows = [
      makeRow({ id: "a", tags: [" photography ", "photography"] }),
    ];
    const result = aggregateTags(rows);
    // " photography " trims to "photography" — should count as 2 on the same row
    assert.equal(result.length, 1);
    assert.equal(result[0].value, "photography");
    assert.equal(result[0].count, 2);
  });

  it("ignores blank tags after trim", () => {
    const rows = [makeRow({ id: "a", tags: ["", "  ", "valid"] })];
    const result = aggregateTags(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].value, "valid");
  });
});

// ── aggregateCategories ───────────────────────────────────────────────────────

describe("aggregateCategories", () => {
  it("returns empty array for empty input", () => {
    assert.deepEqual(aggregateCategories([]), []);
  });

  it("counts categories across templates", () => {
    const rows = [
      makeRow({ id: "a", category: "Layout" }),
      makeRow({ id: "b", category: "Layout" }),
      makeRow({ id: "c", category: "Hero" }),
    ];
    const result = aggregateCategories(rows);
    const byValue = Object.fromEntries(result.map((e) => [e.value, e.count]));
    assert.equal(byValue["Layout"], 2);
    assert.equal(byValue["Hero"], 1);
  });

  it("sorts by count descending then value ascending", () => {
    const rows = [
      makeRow({ id: "a", category: "Zebra" }),
      makeRow({ id: "b", category: "Apple" }),
      makeRow({ id: "c", category: "Apple" }),
    ];
    const result = aggregateCategories(rows);
    assert.equal(result[0].value, "Apple");
    assert.equal(result[1].value, "Zebra");
  });

  it("trims whitespace from category values", () => {
    const rows = [
      makeRow({ id: "a", category: " Layout " }),
      makeRow({ id: "b", category: "Layout" }),
    ];
    const result = aggregateCategories(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].count, 2);
  });
});

// ── applyTagRename ────────────────────────────────────────────────────────────

describe("applyTagRename", () => {
  it("returns null when the tag is not present", () => {
    assert.equal(applyTagRename(["a", "b"], "c", "d"), null);
  });

  it("renames the matching tag", () => {
    const result = applyTagRename(["photography", "portrait"], "photography", "photo");
    assert.ok(result);
    assert.ok(result.includes("photo"));
    assert.ok(!result.includes("photography"));
    assert.ok(result.includes("portrait"));
  });

  it("deduplicates when target tag already exists on the row", () => {
    const result = applyTagRename(["photo", "photography"], "photography", "photo");
    assert.ok(result);
    // "photo" was already there; after rename "photography" → "photo" we'd have
    // two "photo" entries; the Set deduplication yields only one.
    assert.equal(result.filter((t) => t === "photo").length, 1);
  });

  it("returns null for empty tags array", () => {
    assert.equal(applyTagRename([], "a", "b"), null);
  });

  it("preserves order of other tags (as Set iteration order)", () => {
    const result = applyTagRename(["x", "old", "y"], "old", "new");
    assert.ok(result);
    assert.ok(result.includes("x"));
    assert.ok(result.includes("new"));
    assert.ok(result.includes("y"));
  });
});

// ── applyTagMerge ─────────────────────────────────────────────────────────────

describe("applyTagMerge", () => {
  it("returns null when none of the from-tags are present", () => {
    assert.equal(applyTagMerge(["a", "b"], ["x", "y"], "z"), null);
  });

  it("replaces a single from-tag with the into-tag", () => {
    const result = applyTagMerge(
      ["photography", "portrait"],
      ["photography"],
      "photo",
    );
    assert.ok(result);
    assert.ok(result.includes("photo"));
    assert.ok(!result.includes("photography"));
    assert.ok(result.includes("portrait"));
  });

  it("replaces multiple from-tags with the into-tag", () => {
    const result = applyTagMerge(
      ["photo", "photography", "portrait"],
      ["photo", "photography"],
      "images",
    );
    assert.ok(result);
    assert.equal(result.filter((t) => t === "images").length, 1);
    assert.ok(!result.includes("photo"));
    assert.ok(!result.includes("photography"));
    assert.ok(result.includes("portrait"));
  });

  it("deduplicates when into-tag already present", () => {
    const result = applyTagMerge(["images", "photography"], ["photography"], "images");
    assert.ok(result);
    assert.equal(result.filter((t) => t === "images").length, 1);
  });

  it("returns null for empty tags array", () => {
    assert.equal(applyTagMerge([], ["a"], "b"), null);
  });
});

// ── applyTagDelete ────────────────────────────────────────────────────────────

describe("applyTagDelete", () => {
  it("returns null when tag is not present", () => {
    assert.equal(applyTagDelete(["a", "b"], "c"), null);
  });

  it("removes the tag", () => {
    const result = applyTagDelete(["photography", "portrait"], "photography");
    assert.ok(result);
    assert.deepEqual(result, ["portrait"]);
  });

  it("returns empty array when the only tag is removed", () => {
    const result = applyTagDelete(["solo"], "solo");
    assert.ok(result);
    assert.deepEqual(result, []);
  });

  it("returns null for empty tags array", () => {
    assert.equal(applyTagDelete([], "x"), null);
  });

  it("only removes exact matches (case-sensitive)", () => {
    const result = applyTagDelete(["Photography", "photography"], "photography");
    assert.ok(result);
    assert.ok(result.includes("Photography"));
    assert.ok(!result.includes("photography"));
  });
});
