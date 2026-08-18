import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  computeRevisionStructuredDiff,
  treeFromRevisionSnapshot,
} from "./revisions-diff";

function node(
  id: string,
  kind: string,
  props: Record<string, unknown> = {},
  children: unknown[] = [],
) {
  return { id, kind, props, children };
}

describe("computeRevisionStructuredDiff", () => {
  test("flags added and removed nodes by id", () => {
    const a = [node("a", "heading", { text: "Hello" })];
    const b = [node("b", "paragraph", { text: "World" })];
    const diff = computeRevisionStructuredDiff(a, b);
    assert.equal(diff.summary.removed, 1);
    assert.equal(diff.summary.added, 1);
    assert.equal(diff.nodes.some((n) => n.id === "a" && n.op === "removed"), true);
    assert.equal(diff.nodes.some((n) => n.id === "b" && n.op === "added"), true);
  });

  test("reports text / href / fill / reorder property changes", () => {
    const a = [
      node("h", "heading", { text: "Old", href: "/a", style: { backgroundColor: "#fff" } }),
      node("p", "paragraph", { text: "Keep" }),
    ];
    const b = [
      node("p", "paragraph", { text: "Keep" }),
      node("h", "heading", { text: "New", href: "/b", style: { backgroundColor: "#000" } }),
    ];
    const diff = computeRevisionStructuredDiff(a, b);
    const changed = diff.nodes.find((n) => n.id === "h");
    assert.ok(changed);
    assert.equal(changed.op, "changed");
    const props = new Set(changed.properties.map((p) => p.property));
    assert.ok(props.has("text"));
    assert.ok(props.has("href"));
    assert.ok(props.has("fill"));
    assert.ok(props.has("reorder"));
  });

  test("parks extra style keys behind styleDetails", () => {
    const a = [node("c", "container", { style: { radius: "none", paddingX: "s" } })];
    const b = [node("c", "container", { style: { radius: "lg", paddingX: "l" } })];
    const diff = computeRevisionStructuredDiff(a, b);
    const changed = diff.nodes.find((n) => n.id === "c");
    assert.ok(changed?.styleDetails);
    assert.equal(changed.styleDetails.radius?.after, "lg");
  });

  test("caps visible nodes and reports remainder", () => {
    const a = Array.from({ length: 50 }, (_, i) => node(`n${i}`, "heading", { text: "a" }));
    const b = Array.from({ length: 50 }, (_, i) => node(`n${i}`, "heading", { text: "b" }));
    const diff = computeRevisionStructuredDiff(a, b, { maxNodes: 10 });
    assert.equal(diff.nodes.length, 10);
    assert.equal(diff.remainderCount, 40);
    assert.equal(diff.summary.changed, 50);
  });
});

test("treeFromRevisionSnapshot prefers builderTree", () => {
  const tree = treeFromRevisionSnapshot({
    builderTree: [node("x", "heading")],
    composition: [{ sectionId: "s1" }],
  });
  assert.equal((tree[0] as { id: string }).id, "x");
});
