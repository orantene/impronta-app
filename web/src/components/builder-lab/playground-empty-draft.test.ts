/**
 * playground-empty-draft.test.ts — the "abandoned + New click" classifier.
 *
 * Four rows with a zero-root tree have sat in the Playground since 2026-08-19.
 * They can never be published (`validateTemplateForPublish` blocks an empty
 * tree, correctly — publishing one would insert nothing), so they were permanent
 * clutter with no path forward. The list now labels them and offers a discard.
 *
 * The two ways this classifier could do harm, both pinned below:
 *   • too WIDE — absorbing a published or in-review row with an empty tree. That
 *     would be a different and much worse bug, and quietly relabelling it
 *     "abandoned draft" would hide it.
 *   • too NARROW — missing the `builder_tree: []` shape the rows actually have.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";
import { isEmptyDraft } from "./playground-shared";

function row(over: Partial<BuilderTemplateRow>): BuilderTemplateRow {
  return {
    id: "r1",
    kind: "page_template",
    status: "draft",
    target_context: "workspace",
    title: "Untitled",
    slug: "untitled",
    description: null,
    category: "Uncategorized",
    gallery_tab: "page_templates",
    tags: [],
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
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    ...over,
  } as BuilderTemplateRow;
}

const ONE_NODE = [
  { id: "n1", kind: "heading", props: { text: "Hi", level: 2 } },
] as unknown as BuilderTemplateRow["builder_tree"];

describe("isEmptyDraft", () => {
  it("flags a draft whose tree has zero roots", () => {
    assert.equal(isEmptyDraft(row({})), true);
  });

  it("does not flag a draft that has anything on the canvas", () => {
    assert.equal(isEmptyDraft(row({ builder_tree: ONE_NODE })), false);
  });

  it("does NOT absorb a published row with an empty tree", () => {
    // That would be a real bug shipping nothing to real tenants. It must stay
    // visible as itself, not be relabelled as abandoned clutter.
    assert.equal(isEmptyDraft(row({ status: "published" })), false);
  });

  it("does NOT absorb an in-review row with an empty tree", () => {
    assert.equal(isEmptyDraft(row({ status: "in_review" })), false);
  });

  it("leaves an already-archived empty row alone — it is resolved", () => {
    assert.equal(isEmptyDraft(row({ status: "archived" })), false);
  });

  it("tolerates a null/absent tree from an older row", () => {
    assert.equal(
      isEmptyDraft(row({ builder_tree: null as unknown as [] })),
      true,
    );
  });
});
