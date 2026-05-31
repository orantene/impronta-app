import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "./types";
import {
  syncComponentInstances,
  countComponentInstances,
  tagAsInstance,
  detachComponentInstance,
  resolveInstanceChildren,
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

// ── Phase 3: live-render resolution ──────────────────────────────────────────

function heading(id: string, text: string): BuilderNode {
  return { id, kind: "heading", props: { text, level: 2 } } as BuilderNode;
}
function button(id: string, label: string, href = "/"): BuilderNode {
  return { id, kind: "button", props: { label, href, tone: "primary" } } as BuilderNode;
}
function image(id: string, src: string): BuilderNode {
  return { id, kind: "image", props: { src } } as BuilderNode;
}
function instance(id: string, instanceOf: string | undefined, overrides?: object, kids: BuilderNode[] = []): BuilderNode {
  return {
    id, kind: "container",
    props: { layout: "stack", ...(instanceOf ? { instanceOf } : {}), ...(overrides ? { instanceOverrides: overrides } : {}) },
    children: kids,
  } as BuilderNode;
}

// Master component subtree root (a container) with a heading + button + image.
const MASTER = container("master-root", [
  heading("m-h", "Master heading"),
  button("m-b", "Master CTA", "/master"),
  image("m-img", "/master.jpg"),
]);
const DEFS = { "cmp-1": MASTER };

test("resolveInstanceChildren: null for non-instance / missing component / fallback path", () => {
  assert.equal(resolveInstanceChildren(container("plain", []), DEFS), null);
  assert.equal(resolveInstanceChildren(instance("i", "cmp-MISSING"), DEFS), null);
  assert.equal(resolveInstanceChildren(heading("h", "x"), DEFS), null);
});

test("resolveInstanceChildren: resolves master children with namespaced ids", () => {
  const resolved = resolveInstanceChildren(instance("inst1", "cmp-1"), DEFS)!;
  assert.equal(resolved.length, 3);
  assert.deepEqual(resolved.map((n) => n.id), ["inst1__m-h", "inst1__m-b", "inst1__m-img"]);
  // master content passes through untouched when no overrides
  assert.equal((resolved[0].props as { text: string }).text, "Master heading");
});

test("resolveInstanceChildren: two instances get distinct namespaced ids (no key collision)", () => {
  const a = resolveInstanceChildren(instance("A", "cmp-1"), DEFS)!;
  const b = resolveInstanceChildren(instance("B", "cmp-1"), DEFS)!;
  assert.equal(a[0].id, "A__m-h");
  assert.equal(b[0].id, "B__m-h");
  assert.notEqual(a[0].id, b[0].id);
});

test("resolveInstanceChildren: per-instance overrides apply by MASTER id", () => {
  const ov = { "m-h": { text: "Custom heading" }, "m-b": { text: "Buy now", href: "/buy" }, "m-img": { imageSrc: "/custom.jpg", imageAlt: "Custom" } };
  const r = resolveInstanceChildren(instance("inst1", "cmp-1", ov), DEFS)!;
  assert.equal((r[0].props as { text: string }).text, "Custom heading");
  assert.equal((r[1].props as { label: string }).label, "Buy now");
  assert.equal((r[1].props as { href: string }).href, "/buy");
  assert.equal((r[2].props as { src: string }).src, "/custom.jpg");
  assert.equal((r[2].props as { alt: string }).alt, "Custom");
});

test("resolveInstanceChildren: empty-string override never wipes master content", () => {
  const r = resolveInstanceChildren(instance("inst1", "cmp-1", { "m-h": { text: "" } }), DEFS)!;
  assert.equal((r[0].props as { text: string }).text, "Master heading");
});

test("resolveInstanceChildren: master + instance are not mutated (pure)", () => {
  const ov = { "m-h": { text: "Changed" } };
  const inst = instance("inst1", "cmp-1", ov);
  resolveInstanceChildren(inst, DEFS);
  const masterKids = (MASTER as { children: BuilderNode[] }).children;
  assert.equal((masterKids[0].props as { text: string }).text, "Master heading");
  assert.equal((inst as { children: BuilderNode[] }).children.length, 0);
});

import { collectOverridableSlots, setInstanceOverride } from "./component-instances";

test("collectOverridableSlots: collects text/button/image slots depth-first", () => {
  const slots = collectOverridableSlots(MASTER);
  assert.deepEqual(slots.map((s) => s.masterId), ["m-h", "m-b", "m-img"]);
  assert.deepEqual(slots.map((s) => s.field), ["text", "text", "imageSrc"]);
  const btn = slots.find((s) => s.kind === "button")!;
  assert.equal(btn.supportsHref, true);
  assert.equal(slots[0].defaultValue, "Master heading");
});

test("setInstanceOverride: sets, then clears (prunes empty) an override", () => {
  const tree = [instance("inst1", "cmp-1")];
  const withOv = setInstanceOverride(tree, "inst1", "m-h", { text: "Hi" });
  assert.equal((withOv[0].props as { instanceOverrides: Record<string, { text: string }> }).instanceOverrides["m-h"].text, "Hi");
  // clearing with empty removes the key (and the whole map when last one goes)
  const cleared = setInstanceOverride(withOv, "inst1", "m-h", { text: "" });
  assert.equal((cleared[0].props as { instanceOverrides?: unknown }).instanceOverrides, undefined);
});

test("setInstanceOverride: only touches the matching instance node (pure)", () => {
  const tree = [instance("A", "cmp-1"), instance("B", "cmp-1")];
  const next = setInstanceOverride(tree, "A", "m-h", { text: "X" });
  assert.ok((next[0].props as { instanceOverrides?: unknown }).instanceOverrides);
  assert.equal((next[1].props as { instanceOverrides?: unknown }).instanceOverrides, undefined);
});
