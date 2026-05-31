import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "./types";
import {
  syncComponentInstances,
  countComponentInstances,
  tagAsInstance,
  detachComponentInstance,
} from "./component-instances";

function container(
  id: string,
  children: BuilderNode[] = [],
  instanceOf?: string,
): BuilderNode {
  return {
    id,
    kind: "container",
    props: { layout: "stack", ...(instanceOf ? { instanceOf } : {}) },
    children,
  } as BuilderNode;
}

function collectIds(node: BuilderNode, acc: string[] = []): string[] {
  acc.push(node.id);
  if ("children" in node && Array.isArray(node.children)) {
    node.children.forEach((c) => collectIds(c, acc));
  }
  return acc;
}

const MASTER_CHILDREN: BuilderNode[] = [
  container("master-child-a", [container("master-grandchild")]),
  container("master-child-b"),
];

test("sync replaces a matching instance's children with fresh-id master clones", () => {
  const tree = [container("root", [container("inst", [container("old-child")], "cmp-1")])];
  const { tree: next, synced } = syncComponentInstances(tree, "cmp-1", MASTER_CHILDREN);

  assert.equal(synced, 1);
  const inst = (next[0] as BuilderNode & { children: BuilderNode[] }).children[0] as BuilderNode & {
    children: BuilderNode[];
    props: { instanceOf?: string };
  };
  // Instance keeps its own id + tag; children come from the master.
  assert.equal(inst.id, "inst");
  assert.equal(inst.props.instanceOf, "cmp-1");
  assert.equal(inst.children.length, 2);
  // Old child is gone.
  assert.ok(!collectIds(inst).includes("old-child"));
});

test("synced children carry FRESH ids (no collision with the master)", () => {
  const tree = [container("inst", [], "cmp-1")];
  const { tree: next } = syncComponentInstances(tree, "cmp-1", MASTER_CHILDREN);
  const ids = collectIds(next[0]);
  // None of the master's literal ids leak into the page tree.
  for (const masterId of ["master-child-a", "master-child-b", "master-grandchild"]) {
    assert.ok(!ids.includes(masterId), `fresh clone must not reuse ${masterId}`);
  }
});

test("instances of a different component are untouched", () => {
  const tree = [container("inst", [container("keep")], "cmp-OTHER")];
  const { tree: next, synced } = syncComponentInstances(tree, "cmp-1", MASTER_CHILDREN);
  assert.equal(synced, 0);
  assert.deepEqual(collectIds(next[0]), ["inst", "keep"]);
});

test("multiple instances across the tree are all synced", () => {
  const tree = [
    container("a", [container("i1", [], "cmp-1")]),
    container("b", [container("c", [container("i2", [], "cmp-1")])]),
    container("i3", [], "cmp-1"),
  ];
  const { synced } = syncComponentInstances(tree, "cmp-1", MASTER_CHILDREN);
  assert.equal(synced, 3);
});

test("sync does not recurse into a matched instance (no double-processing)", () => {
  // An instance whose (pre-sync) children themselves contain a same-component tag
  // must still count as ONE — we replace wholesale and never walk the old subtree.
  const tree = [
    container("inst", [container("nested-old", [], "cmp-1")], "cmp-1"),
  ];
  const { synced } = syncComponentInstances(tree, "cmp-1", MASTER_CHILDREN);
  assert.equal(synced, 1);
});

test("countComponentInstances matches sync's count", () => {
  const tree = [
    container("a", [container("i1", [], "cmp-1")]),
    container("i2", [], "cmp-1"),
    container("other", [], "cmp-2"),
  ];
  assert.equal(countComponentInstances(tree, "cmp-1"), 2);
  assert.equal(countComponentInstances(tree, "cmp-2"), 1);
  assert.equal(countComponentInstances(tree, "cmp-x"), 0);
});

test("tagAsInstance tags a container, leaves the tag stable", () => {
  const tagged = tagAsInstance(container("c"), "cmp-9") as BuilderNode & {
    props: { instanceOf?: string };
  };
  assert.equal(tagged.props.instanceOf, "cmp-9");
});

test("tagAsInstance leaves non-container kinds unchanged", () => {
  const heading = { id: "h", kind: "heading", props: {} } as unknown as BuilderNode;
  assert.equal(tagAsInstance(heading, "cmp-9"), heading);
});

test("detach strips the instanceOf tag but keeps children + id", () => {
  const tree = [container("root", [container("inst", [container("kid")], "cmp-1")])];
  const { tree: next, detached } = detachComponentInstance(tree, "inst");
  assert.equal(detached, true);
  const inst = (next[0] as BuilderNode & { children: BuilderNode[] }).children[0] as BuilderNode & {
    children: BuilderNode[];
    props: { instanceOf?: string };
  };
  assert.equal(inst.id, "inst");
  assert.equal(inst.props.instanceOf, undefined);
  assert.deepEqual(collectIds(inst), ["inst", "kid"]);
  // A detached instance is no longer counted/synced.
  assert.equal(countComponentInstances(next, "cmp-1"), 0);
});

test("detach is a no-op for an unknown / non-instance id", () => {
  const tree = [container("inst", [], "cmp-1")];
  const a = detachComponentInstance(tree, "missing");
  assert.equal(a.detached, false);
  const b = detachComponentInstance([container("plain")], "plain");
  assert.equal(b.detached, false);
});

test("original tree is not mutated (pure)", () => {
  const tree = [container("inst", [container("orig-child")], "cmp-1")];
  const before = collectIds(tree[0]);
  syncComponentInstances(tree, "cmp-1", MASTER_CHILDREN);
  assert.deepEqual(collectIds(tree[0]), before);
});
