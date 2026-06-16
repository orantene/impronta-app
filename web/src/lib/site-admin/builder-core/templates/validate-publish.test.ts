/**
 * validate-publish.test.ts — WS-D D1 unit tests.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test \
 *         src/lib/site-admin/builder-core/templates/validate-publish.test.ts
 *
 * Covers the pure publish gate:
 *   1. blocks an empty tree
 *   2. blocks a dangling (unknown source) data binding
 *   3. passes a valid tree (incl. a registered binding)
 *   4. diff vs previous snapshot is advisory, never blocks
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { createBuilderNode, createHeading } from "@/lib/site-admin/builder-node/create";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import {
  validateTemplateForPublish,
  diffTemplateTreeForPublish,
} from "./validate-publish";

// A minimal, structurally valid tree: one section with a heading child. Built
// via the same node factories the editor uses so it passes validateBuilderNodeTree.
function validTree(): BuilderNode[] {
  const section = createBuilderNode("section");
  return [
    {
      ...section,
      children: [createHeading("Hello", 2)],
    },
  ] as BuilderNode[];
}

// A section bound to a data source — the binding lives on the section's props.
function boundTree(sourceKey: string): BuilderNode[] {
  const [section] = validTree();
  return [
    {
      ...section,
      props: { ...(section.props as Record<string, unknown>), dataBinding: { sourceKey } },
    },
  ] as BuilderNode[];
}

describe("validateTemplateForPublish", () => {
  it("blocks an empty tree", () => {
    const empty = validateTemplateForPublish([]);
    assert.equal(empty.ok, false);
    assert.ok(!empty.ok && empty.reasons.length > 0);
    assert.match(empty.reasons.join(" "), /no content/i);

    // null / undefined are treated the same as empty.
    assert.equal(validateTemplateForPublish(null).ok, false);
    assert.equal(validateTemplateForPublish(undefined).ok, false);
  });

  it("blocks a dangling (unknown source) data binding", () => {
    const res = validateTemplateForPublish(boundTree("not_a_real_source"));
    assert.equal(res.ok, false);
    assert.ok(!res.ok);
    assert.match(res.reasons.join(" "), /unknown data source/i);
    assert.match(res.reasons.join(" "), /not_a_real_source/);
  });

  it("passes a valid tree with no bindings", () => {
    // Guard: the fixture itself must be structurally valid, else this test is
    // vacuous (it would "pass" the gate only because validation never ran).
    assert.equal(validateBuilderNodeTree(validTree()).ok, true);
    const res = validateTemplateForPublish(validTree());
    assert.equal(res.ok, true);
  });

  it("passes a valid tree bound to a registered data source", () => {
    const res = validateTemplateForPublish(
      boundTree("featured_talent_profiles"),
    );
    assert.equal(res.ok, true);
  });

  it("accepts an opaque collection:<id> binding as a registered source", () => {
    const res = validateTemplateForPublish(boundTree("collection:abc-123"));
    assert.equal(res.ok, true);
  });

  it("blocks a structurally corrupt tree (bad node)", () => {
    const corrupt = [
      { id: "", kind: "section", props: {}, children: [] },
    ] as unknown as BuilderNode[];
    const res = validateTemplateForPublish(corrupt);
    assert.equal(res.ok, false);
    assert.ok(!res.ok && res.reasons.length > 0);
  });

  it("does not block a no-op (unchanged) re-publish", () => {
    const tree = validTree();
    const res = validateTemplateForPublish(tree, { previousTree: tree });
    assert.equal(res.ok, true);
  });
});

describe("diffTemplateTreeForPublish", () => {
  it("reports first publish as changed with no previous", () => {
    const diff = diffTemplateTreeForPublish(validTree(), null);
    assert.equal(diff.hasPrevious, false);
    assert.equal(diff.changed, true);
  });

  it("detects an unchanged tree (key-order independent)", () => {
    const a = [
      { id: "sec-1", kind: "section", props: { a: 1, b: 2 }, children: [] },
    ] as unknown as BuilderNode[];
    const b = [
      { kind: "section", id: "sec-1", children: [], props: { b: 2, a: 1 } },
    ] as unknown as BuilderNode[];
    const diff = diffTemplateTreeForPublish(a, b);
    assert.equal(diff.hasPrevious, true);
    assert.equal(diff.changed, false);
  });

  it("detects a changed tree", () => {
    const before = validTree();
    const after = boundTree("featured_talent_profiles");
    const diff = diffTemplateTreeForPublish(after, before);
    assert.equal(diff.changed, true);
  });
});
