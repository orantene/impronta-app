/**
 * publish-checklist.test.ts — A6 unit tests for the pre-publish checklist.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test \
 *         src/lib/site-admin/builder-core/templates/publish-checklist.test.ts
 *
 * Covers the pure "map validator result → checklist rows (label, pass/fail,
 * blocking?)" logic that `PublishNotePanel` renders before publishing. The
 * checklist must NOT fork the validator — it wraps `validateTemplateForPublish`
 * and adds advisory metadata rows on top.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  createBuilderNode,
  createHeading,
} from "@/lib/site-admin/builder-node/create";
import {
  previewPublishChecklist,
  type PublishChecklistRow,
} from "./validate-publish";

// One section with a heading child — structurally valid, no bindings.
function validTree(): BuilderNode[] {
  const section = createBuilderNode("section");
  return [{ ...section, children: [createHeading("Hi", 2)] }] as BuilderNode[];
}

// A section bound to a (possibly unknown) data source.
function boundTree(sourceKey: string): BuilderNode[] {
  const [section] = validTree();
  return [
    {
      ...section,
      props: {
        ...(section.props as Record<string, unknown>),
        dataBinding: { sourceKey },
      },
    },
  ] as BuilderNode[];
}

function row(checklist: ReturnType<typeof previewPublishChecklist>, key: PublishChecklistRow["key"]) {
  const r = checklist.rows.find((x) => x.key === key);
  assert.ok(r, `expected a checklist row for "${key}"`);
  return r;
}

describe("previewPublishChecklist — row shape", () => {
  it("always returns exactly the five known rows in order", () => {
    const c = previewPublishChecklist({ tree: validTree() });
    assert.deepEqual(
      c.rows.map((r) => r.key),
      [
        "has_content",
        "bindings_resolvable",
        "has_description",
        "has_thumbnail",
        "has_changelog",
      ],
    );
    // Every row carries a non-empty human label.
    for (const r of c.rows) assert.ok(r.label.length > 0);
  });

  it("structural rows are blocking; metadata rows are advisory", () => {
    const c = previewPublishChecklist({ tree: validTree() });
    assert.equal(row(c, "has_content").blocking, true);
    assert.equal(row(c, "bindings_resolvable").blocking, true);
    assert.equal(row(c, "has_description").blocking, false);
    assert.equal(row(c, "has_thumbnail").blocking, false);
    assert.equal(row(c, "has_changelog").blocking, false);
  });
});

describe("previewPublishChecklist — content / bindings (blocking)", () => {
  it("empty tree → has_content fails and blocks publish", () => {
    const c = previewPublishChecklist({ tree: [] });
    assert.equal(row(c, "has_content").pass, false);
    assert.equal(c.canPublish, false);
    assert.ok(row(c, "has_content").detail);
  });

  it("null/undefined tree behaves like empty", () => {
    assert.equal(previewPublishChecklist({ tree: null }).canPublish, false);
    assert.equal(previewPublishChecklist({ tree: undefined }).canPublish, false);
  });

  it("dangling binding → bindings_resolvable fails and blocks publish", () => {
    const c = previewPublishChecklist({ tree: boundTree("not_a_real_source") });
    assert.equal(row(c, "bindings_resolvable").pass, false);
    assert.equal(c.canPublish, false);
    assert.match(row(c, "bindings_resolvable").detail ?? "", /not_a_real_source/);
    // A dangling binding does NOT falsely fail the content row.
    assert.equal(row(c, "has_content").pass, true);
  });

  it("registered binding → bindings_resolvable passes", () => {
    const c = previewPublishChecklist({
      tree: boundTree("featured_talent_profiles"),
    });
    assert.equal(row(c, "bindings_resolvable").pass, true);
  });
});

describe("previewPublishChecklist — metadata (advisory warnings)", () => {
  it("missing description / thumbnail / changelog → warnings, still publishable", () => {
    const c = previewPublishChecklist({ tree: validTree() });
    assert.equal(row(c, "has_description").pass, false);
    assert.equal(row(c, "has_thumbnail").pass, false);
    assert.equal(row(c, "has_changelog").pass, false);
    // None of these block — a valid tree with no metadata still ships.
    assert.equal(c.canPublish, true);
    assert.equal(c.hasWarnings, true);
  });

  it("blank-string metadata counts as missing", () => {
    const c = previewPublishChecklist({
      tree: validTree(),
      description: "   ",
      thumbnailAssetId: "",
      changelog: "\t",
    });
    assert.equal(row(c, "has_description").pass, false);
    assert.equal(row(c, "has_thumbnail").pass, false);
    assert.equal(row(c, "has_changelog").pass, false);
  });

  it("all metadata present → no warnings", () => {
    const c = previewPublishChecklist({
      tree: validTree(),
      description: "A premium chef one-pager.",
      thumbnailAssetId: "asset-123",
      changelog: "Initial publish.",
    });
    assert.equal(row(c, "has_description").pass, true);
    assert.equal(row(c, "has_thumbnail").pass, true);
    assert.equal(row(c, "has_changelog").pass, true);
    assert.equal(c.hasWarnings, false);
    assert.equal(c.canPublish, true);
  });

  it("pendingChangelog satisfies the changelog row even when stored value is blank", () => {
    const c = previewPublishChecklist({
      tree: validTree(),
      changelog: null,
      pendingChangelog: "About to type this.",
    });
    assert.equal(row(c, "has_changelog").pass, true);
  });

  it("blank pendingChangelog falls back to stored changelog", () => {
    const c = previewPublishChecklist({
      tree: validTree(),
      changelog: "Stored note.",
      pendingChangelog: "   ",
    });
    assert.equal(row(c, "has_changelog").pass, true);
  });
});

describe("previewPublishChecklist — aggregate verdict", () => {
  it("canPublish ignores advisory failures, hasWarnings reflects them", () => {
    const c = previewPublishChecklist({ tree: validTree() });
    assert.equal(c.canPublish, true); // no blocking failure
    assert.equal(c.hasWarnings, true); // metadata missing
  });

  it("a blocking failure flips canPublish even if metadata is complete", () => {
    const c = previewPublishChecklist({
      tree: [],
      description: "x",
      thumbnailAssetId: "y",
      changelog: "z",
    });
    assert.equal(c.canPublish, false);
    assert.equal(c.hasWarnings, false);
  });
});
