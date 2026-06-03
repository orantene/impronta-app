import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode, BuilderNodeInstanceOverride } from "./types";
import {
  syncComponentInstances,
  countComponentInstances,
  tagAsInstance,
  detachComponentInstance,
  resolveInstanceChildren,
  treeHasInstances,
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

import {
  collectOverridableSlots,
  setInstanceOverride,
  applyVariantToInstance,
  clearInstanceVariant,
  readInstanceVariant,
} from "./component-instances";

test("collectOverridableSlots: collects style(root)+text/button/image slots depth-first [T4.4]", () => {
  // Phase 4: the container root surfaces as a STYLE-only slot, then the content
  // slots follow depth-first.
  const slots = collectOverridableSlots(MASTER);
  assert.deepEqual(slots.map((s) => s.masterId), ["master-root", "m-h", "m-b", "m-img"]);
  assert.deepEqual(slots.map((s) => s.field), ["style", "text", "text", "imageSrc"]);
  // The container slot is style-only (no editable value) and supportsStyle.
  assert.equal(slots[0].kind, "container");
  assert.equal(slots[0].supportsStyle, true);
  // Content slots keep their behavior + ALL now supportsStyle.
  const btn = slots.find((s) => s.kind === "button")!;
  assert.equal(btn.supportsHref, true);
  assert.ok(slots.every((s) => s.supportsStyle));
  const headingSlot = slots.find((s) => s.kind === "heading")!;
  assert.equal(headingSlot.defaultValue, "Master heading");
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

// ── Helper factories for accordion / tabs ─────────────────────────────────────

function accordionNode(
  id: string,
  itemIds: string[],
  defaultOpenItemIds?: string[],
): BuilderNode {
  return {
    id,
    kind: "accordion",
    props: {
      ...(defaultOpenItemIds ? { defaultOpenItemIds } : {}),
    },
    children: itemIds.map((iid) => ({
      id: iid,
      kind: "accordion_item",
      props: { title: `Item ${iid}` },
      children: [],
    })),
  } as unknown as BuilderNode;
}

function tabsNode(
  id: string,
  panelIds: string[],
  defaultTabId?: string,
): BuilderNode {
  return {
    id,
    kind: "tabs",
    props: {
      ...(defaultTabId ? { defaultTabId } : {}),
    },
    children: panelIds.map((pid) => ({
      id: pid,
      kind: "tab_panel",
      props: { title: `Panel ${pid}` },
      children: [],
    })),
  } as unknown as BuilderNode;
}

// ── BUG-FIX REGRESSIONS: accordion / tabs id remapping in materializeForInstance ──

test("resolveInstanceChildren: accordion defaultOpenItemIds are remapped to namespaced ids [BUG FIX]", () => {
  // Master: container → accordion("acc") with items ai-open + ai-closed;
  //   accordion has defaultOpenItemIds: ["ai-open"].
  // After materialization for instance "inst-X":
  //   accordion id → "inst-X__acc"
  //   item ids    → "inst-X__ai-open", "inst-X__ai-closed"
  //   defaultOpenItemIds MUST → ["inst-X__ai-open"]  (was broken: stayed ["ai-open"])
  const masterAcc = accordionNode("acc", ["ai-open", "ai-closed"], ["ai-open"]);
  const master = container("m-root", [masterAcc]);
  const defs = { "cmp-acc": master };

  const resolved = resolveInstanceChildren(instance("inst-X", "cmp-acc"), defs)!;
  assert.equal(resolved.length, 1);
  const acc = resolved[0] as { id: string; props: { defaultOpenItemIds: string[] }; children: BuilderNode[] };
  assert.equal(acc.id, "inst-X__acc");
  // Props must use the namespaced child ids, not the raw master ids.
  assert.deepEqual(acc.props.defaultOpenItemIds, ["inst-X__ai-open"]);
  // Actual child ids are also namespaced.
  const childIds = acc.children.map((c) => c.id);
  assert.ok(childIds.includes("inst-X__ai-open"), "item id must be namespaced");
  assert.ok(childIds.includes("inst-X__ai-closed"), "item id must be namespaced");
});

test("resolveInstanceChildren: accordion with multiple open items — all remapped [BUG FIX]", () => {
  const masterAcc = accordionNode("acc2", ["i1", "i2", "i3"], ["i1", "i3"]);
  const master = container("m2", [masterAcc]);
  const defs = { "cmp-m2": master };

  const resolved = resolveInstanceChildren(instance("inst-Z", "cmp-m2"), defs)!;
  const acc = resolved[0] as { props: { defaultOpenItemIds: string[] } };
  assert.deepEqual(acc.props.defaultOpenItemIds, ["inst-Z__i1", "inst-Z__i3"]);
});

test("resolveInstanceChildren: tabs defaultTabId is remapped to namespaced id [BUG FIX]", () => {
  // Master: container → tabs("tabs") with panels panel-a + panel-b;
  //   defaultTabId: "panel-a".
  // After materialization for instance "inst-Y":
  //   tabs id     → "inst-Y__tabs"
  //   panel ids   → "inst-Y__panel-a", "inst-Y__panel-b"
  //   defaultTabId MUST → "inst-Y__panel-a"  (was broken: stayed "panel-a")
  const masterTabs = tabsNode("tabs", ["panel-a", "panel-b"], "panel-a");
  const master = container("m-root-t", [masterTabs]);
  const defs = { "cmp-tabs": master };

  const resolved = resolveInstanceChildren(instance("inst-Y", "cmp-tabs"), defs)!;
  assert.equal(resolved.length, 1);
  const tabs = resolved[0] as { id: string; props: { defaultTabId: string }; children: BuilderNode[] };
  assert.equal(tabs.id, "inst-Y__tabs");
  assert.equal(tabs.props.defaultTabId, "inst-Y__panel-a");
  assert.equal(tabs.children[0].id, "inst-Y__panel-a");
});

test("resolveInstanceChildren: two instances of accordion share no id collision [BUG FIX]", () => {
  const masterAcc = accordionNode("acc", ["item-1", "item-2"], ["item-1"]);
  const master = container("m-root", [masterAcc]);
  const defs = { "cmp-acc": master };

  const resolvedA = resolveInstanceChildren(instance("instA", "cmp-acc"), defs)!;
  const resolvedB = resolveInstanceChildren(instance("instB", "cmp-acc"), defs)!;
  const accA = resolvedA[0] as { props: { defaultOpenItemIds: string[] } };
  const accB = resolvedB[0] as { props: { defaultOpenItemIds: string[] } };
  // Each instance's defaultOpenItemIds ref its OWN namespaced items.
  assert.deepEqual(accA.props.defaultOpenItemIds, ["instA__item-1"]);
  assert.deepEqual(accB.props.defaultOpenItemIds, ["instB__item-1"]);
  assert.notDeepEqual(accA.props.defaultOpenItemIds, accB.props.defaultOpenItemIds);
});

test("resolveInstanceChildren: tabs with no defaultTabId — prop absent in materialized output", () => {
  const masterTabs = tabsNode("tabs-nd", ["p1", "p2"]); // no defaultTabId
  const master = container("m-nd", [masterTabs]);
  const defs = { "cmp-nd": master };

  const resolved = resolveInstanceChildren(instance("inst-nd", "cmp-nd"), defs)!;
  const tabs = resolved[0] as { props: Record<string, unknown> };
  // No defaultTabId was set on the master; ensure no phantom value appears.
  assert.equal(tabs.props.defaultTabId, undefined);
});

// ── Edge cases: empty / childless master ─────────────────────────────────────

test("resolveInstanceChildren: childless master returns [] not null", () => {
  const childlessMaster = container("empty-master"); // children = []
  const defs = { "cmp-empty": childlessMaster };

  const resolved = resolveInstanceChildren(instance("inst-e", "cmp-empty"), defs);
  // Must return an empty array (not null) so caller can distinguish
  // "component defined but empty" from "component not found".
  assert.ok(Array.isArray(resolved), "should return an array");
  assert.equal(resolved!.length, 0);
});

test("resolveInstanceChildren: non-container master node returns [] for its children", () => {
  // A master that is a heading (not a container) has no children array.
  // resolveInstanceChildren treats its children as [] → returns [].
  const masterHeading = heading("m-h-only", "Title only");
  const defs = { "cmp-h": masterHeading };

  const resolved = resolveInstanceChildren(instance("inst-h", "cmp-h"), defs);
  assert.ok(Array.isArray(resolved), "non-container master → []");
  assert.equal(resolved!.length, 0);
});

// ── Edge cases: deep override coverage ───────────────────────────────────────

test("resolveInstanceChildren: overrides apply at 3 levels of nesting", () => {
  // master: container → container("c1") → container("c2") → heading("deep-h")
  const deepHeading = heading("deep-h", "Original deep");
  const level2 = container("c2", [deepHeading]);
  const level1 = container("c1", [level2]);
  const deepMaster = container("deep-master", [level1]);
  const defs = { "cmp-deep": deepMaster };

  const overrides = { "deep-h": { text: "Overridden deep" } };
  const resolved = resolveInstanceChildren(instance("inst-deep", "cmp-deep", overrides), defs)!;

  // Traverse inst-deep → c1 → c2 → deep-h (all namespaced).
  const l1 = (resolved[0] as { children: BuilderNode[] }).children[0];
  const l2 = (l1 as { children: BuilderNode[] }).children[0];
  assert.equal(l2.id, "inst-deep__deep-h");
  assert.equal((l2.props as { text: string }).text, "Overridden deep");
});

// ── Edge cases: nested instanceOf inside master ───────────────────────────────

test("resolveInstanceChildren: nested instanceOf inside master — instanceOf prop preserved, not recursively resolved", () => {
  // Design decision: a master may contain a container tagged instanceOf a DIFFERENT
  // component. That nested instance is materialized with its stored children from
  // the master, but its instanceOf tag is preserved in the output. No recursive
  // live-resolution of the nested component occurs here.
  const nestedInstance = container("nested-inst", [heading("nested-kid", "Nested content")], "cmp-other");
  const master = container("m-with-nested", [nestedInstance]);
  const defs = {
    "cmp-outer": master,
    "cmp-other": container("other-root", [heading("other-kid", "From other component")]),
  };

  const resolved = resolveInstanceChildren(instance("inst-outer", "cmp-outer"), defs)!;
  const nestedMat = resolved[0] as { id: string; props: { instanceOf?: string }; children: BuilderNode[] };
  assert.equal(nestedMat.id, "inst-outer__nested-inst");
  // instanceOf tag is preserved — caller could resolve it if needed.
  assert.equal(nestedMat.props.instanceOf, "cmp-other");
  // Children come from the master's stored subtree (nested-kid), NOT from cmp-other's children.
  assert.equal(nestedMat.children.length, 1);
  assert.equal(nestedMat.children[0].id, "inst-outer__nested-kid");
});

// ── syncComponentInstances: additional edge cases ────────────────────────────

test("syncComponentInstances: empty masterChildren replaces instance children with []", () => {
  const tree = [container("inst", [container("old"), container("also-old")], "cmp-empty-sync")];
  const { tree: next, synced } = syncComponentInstances(tree, "cmp-empty-sync", []);
  assert.equal(synced, 1);
  const inst = next[0] as { children: BuilderNode[] };
  assert.equal(inst.children.length, 0);
});

test("syncComponentInstances: idempotent structure — syncing twice with same master gives same shape", () => {
  const tree = [container("inst", [], "cmp-idem")];
  const { tree: pass1 } = syncComponentInstances(tree, "cmp-idem", MASTER_CHILDREN);
  const { tree: pass2, synced } = syncComponentInstances(pass1, "cmp-idem", MASTER_CHILDREN);
  assert.equal(synced, 1);
  // Structure (child count + kinds) must match — ids will differ (fresh UUIDs each sync).
  const kids1 = ((pass1[0] as { children: BuilderNode[] }).children).map((c) => c.kind);
  const kids2 = ((pass2[0] as { children: BuilderNode[] }).children).map((c) => c.kind);
  assert.deepEqual(kids1, kids2);
});

test("syncComponentInstances: all ids across multiple synced instances are globally unique", () => {
  const tree = [
    container("inst1", [], "cmp-uniq"),
    container("inst2", [], "cmp-uniq"),
    container("inst3", [], "cmp-uniq"),
  ];
  const master: BuilderNode[] = [
    container("mc-a", [container("mc-b"), container("mc-c")]),
    container("mc-d"),
  ];
  const { tree: next } = syncComponentInstances(tree, "cmp-uniq", master);

  // Collect every id in the resulting tree.
  const allIds: string[] = [];
  const collectAll = (node: BuilderNode) => {
    allIds.push(node.id);
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(collectAll);
    }
  };
  next.forEach(collectAll);

  const unique = new Set(allIds);
  assert.equal(unique.size, allIds.length, "every id in the synced tree must be globally unique");
});

test("syncComponentInstances: does not mutate input masterChildren array", () => {
  const master = [container("mc", [container("mc-child")])];
  const masterSnapshot = JSON.stringify(master);
  const tree = [container("inst", [], "cmp-1")];
  syncComponentInstances(tree, "cmp-1", master);
  assert.equal(JSON.stringify(master), masterSnapshot, "masterChildren must not be mutated");
});

// ── setInstanceOverride: additional edge cases ───────────────────────────────

test("setInstanceOverride: null override on a non-existent key creates no entry", () => {
  const tree = [instance("inst1", "cmp-1")]; // no overrides yet
  const next = setInstanceOverride(tree, "inst1", "m-h", null);
  assert.equal((next[0].props as { instanceOverrides?: unknown }).instanceOverrides, undefined);
});

test("setInstanceOverride: preserves existing overrides when adding a new one", () => {
  const tree = [instance("inst1", "cmp-1")];
  const t1 = setInstanceOverride(tree, "inst1", "m-h", { text: "Heading A" });
  const t2 = setInstanceOverride(t1, "inst1", "m-b", { text: "Button B" });
  const ov = (t2[0].props as { instanceOverrides: Record<string, { text: string }> }).instanceOverrides;
  assert.equal(ov["m-h"].text, "Heading A", "first override must be preserved");
  assert.equal(ov["m-b"].text, "Button B", "second override must be set");
});

test("setInstanceOverride: clearing one key leaves others intact", () => {
  const tree = [instance("inst1", "cmp-1")];
  const t1 = setInstanceOverride(tree, "inst1", "m-h", { text: "Keep" });
  const t2 = setInstanceOverride(t1, "inst1", "m-b", { text: "Delete me" });
  const t3 = setInstanceOverride(t2, "inst1", "m-b", null);
  const ov = (t3[0].props as { instanceOverrides: Record<string, { text: string }> }).instanceOverrides;
  assert.equal(ov["m-h"].text, "Keep", "uncleared override survives");
  assert.equal(ov["m-b"], undefined, "cleared key must be absent");
});

test("setInstanceOverride: non-matching node id is a no-op (tree unchanged)", () => {
  const tree = [instance("inst1", "cmp-1")];
  const next = setInstanceOverride(tree, "nonexistent", "m-h", { text: "Hi" });
  assert.deepEqual(next, tree);
});

// ── countComponentInstances: depth coverage ──────────────────────────────────

test("countComponentInstances: deeply nested instances are counted", () => {
  const tree = [
    container("root", [
      container("lvl1", [
        container("lvl2", [
          container("lvl3-inst", [], "cmp-deep-count"),
        ]),
      ]),
    ]),
  ];
  assert.equal(countComponentInstances(tree, "cmp-deep-count"), 1);
});

test("countComponentInstances: instance stops recursion — its own children not double-counted", () => {
  // An instance contains a same-component tag in its STORED children.
  // countComponentInstances must not recurse into the instance's children.
  const tree = [
    container("inst-outer", [
      // This child has instanceOf too, but it's inside an instance — should not be counted.
      container("inst-inner", [], "cmp-1"),
    ], "cmp-1"),
  ];
  assert.equal(countComponentInstances(tree, "cmp-1"), 1);
});

// ── treeHasInstances ─────────────────────────────────────────────────────────

test("treeHasInstances: returns true when any container carries instanceOf", () => {
  const tree = [container("root", [container("inst", [], "cmp-x")])];
  assert.equal(treeHasInstances(tree), true);
});

test("treeHasInstances: returns false when no instance tags exist", () => {
  const tree = [
    container("root", [
      heading("h", "no instance"),
      container("plain"),
    ]),
  ];
  assert.equal(treeHasInstances(tree), false);
});

test("treeHasInstances: returns false for empty tree", () => {
  assert.equal(treeHasInstances([]), false);
});

// ── collectOverridableSlots: deeper tree coverage ────────────────────────────

test("collectOverridableSlots: nested slots collected depth-first incl. container style slots [T4.4]", () => {
  const nestedMaster = container("nm-root", [
    container("nm-inner", [
      heading("nm-h", "Deep heading"),
      button("nm-b", "Deep button"),
    ]),
    image("nm-img", "/deep.jpg"),
  ]);
  const slots = collectOverridableSlots(nestedMaster);
  // Depth-first incl. style-only container wrappers:
  // root(style) → inner(style) → inner heading → inner button → outer image
  assert.deepEqual(slots.map((s) => s.masterId), ["nm-root", "nm-inner", "nm-h", "nm-b", "nm-img"]);
  assert.deepEqual(slots.map((s) => s.field), ["style", "style", "text", "text", "imageSrc"]);
});

test("collectOverridableSlots: container with no content children yields style-only wrapper slots [T4.4]", () => {
  // Phase 4: bare containers are now STYLE-only slots (not skipped), so an
  // instance can restyle a wrapper. Two containers → two style slots.
  const emptyMaster = container("empty", [container("inner-plain")]);
  const slots = collectOverridableSlots(emptyMaster);
  assert.deepEqual(slots.map((s) => s.masterId), ["empty", "inner-plain"]);
  assert.ok(slots.every((s) => s.field === "style"));
});

// ── Phase 4 (T4.4): STYLE overrides ──────────────────────────────────────────

test("resolveInstanceChildren: a style override layers OVER the master child base style [T4.4]", () => {
  // Master heading has a base style; the instance recolors it.
  const styledHeading = {
    id: "sh", kind: "heading",
    props: { text: "Title", level: 2, style: { textColor: "#000", marginTop: "m" } },
  } as unknown as BuilderNode;
  const master = container("sm-root", [styledHeading]);
  const defs = { "cmp-style": master };

  const ov = { sh: { style: { textColor: "#c00" } } };
  const r = resolveInstanceChildren(instance("inst-s", "cmp-style", ov), defs)!;
  const headingProps = r[0].props as { style: Record<string, string> };
  // override wins on textColor; the master's marginTop is preserved.
  assert.equal(headingProps.style.textColor, "#c00");
  assert.equal(headingProps.style.marginTop, "m");
});

test("resolveInstanceChildren: an empty style override is a no-op (master style untouched) [T4.4]", () => {
  const styledHeading = {
    id: "sh", kind: "heading",
    props: { text: "Title", level: 2, style: { textColor: "#000" } },
  } as unknown as BuilderNode;
  const master = container("sm2", [styledHeading]);
  const defs = { "cmp-style2": master };

  const r = resolveInstanceChildren(instance("inst-s2", "cmp-style2", { sh: { style: {} } }), defs)!;
  const headingProps = r[0].props as { style: Record<string, string> };
  assert.equal(headingProps.style.textColor, "#000");
});

test("resolveInstanceChildren: a style override on a master with NO base style creates the style [T4.4]", () => {
  const master = container("sm3", [heading("h3", "Title")]); // heading has no style
  const defs = { "cmp-style3": master };
  const r = resolveInstanceChildren(instance("inst-s3", "cmp-style3", { h3: { style: { textColor: "#fff" } } }), defs)!;
  assert.equal((r[0].props as { style: { textColor: string } }).style.textColor, "#fff");
});

// ── Phase 4 (T4.4): NESTED slots ─────────────────────────────────────────────

test("resolveInstanceChildren: nested `slots` override targets a grandchild [T4.4]", () => {
  // master: root → inner(container) → heading(deep)
  const inner = container("nsl-inner", [heading("nsl-deep", "Deep master")]);
  const master = container("nsl-root", [inner]);
  const defs = { "cmp-slots": master };

  // Override the inner container, and through its `slots`, the deep heading.
  const ov = { "nsl-inner": { slots: { "nsl-deep": { text: "Deep override" } } } };
  const r = resolveInstanceChildren(instance("inst-sl", "cmp-slots", ov), defs)!;
  const innerResolved = r[0] as { children: BuilderNode[] };
  const deep = innerResolved.children[0];
  assert.equal(deep.id, "inst-sl__nsl-deep");
  assert.equal((deep.props as { text: string }).text, "Deep override");
});

test("resolveInstanceChildren: a parent's nested slot refines (wins over) a flat entry for the same descendant [T4.4]", () => {
  const inner = container("ow-inner", [heading("ow-deep", "Master")]);
  const master = container("ow-root", [inner]);
  const defs = { "cmp-ow": master };
  // Both a nested slot AND a flat entry target ow-deep. The nested slot is more
  // specific (scoped under its parent), so it refines the flat base and wins.
  const ov = {
    "ow-inner": { slots: { "ow-deep": { text: "From slot" } } },
    "ow-deep": { text: "From flat" },
  };
  const r = resolveInstanceChildren(instance("inst-ow", "cmp-ow", ov), defs)!;
  const deep = (r[0] as { children: BuilderNode[] }).children[0];
  assert.equal((deep.props as { text: string }).text, "From slot");
});

// ── Phase 4 (T4.4): CARD instance roots (non-container) ───────────────────────

function card(id: string, children: BuilderNode[] = [], instanceOf?: string): BuilderNode {
  return {
    id, kind: "card",
    props: { variant: "elevated", ...(instanceOf ? { instanceOf } : {}) },
    children,
  } as unknown as BuilderNode;
}

test("resolveInstanceChildren: a CARD instance root resolves master children [T4.4]", () => {
  const master = card("card-master", [heading("cm-h", "Card title"), button("cm-b", "Go")]);
  const defs = { "cmp-card": master };
  const inst = card("card-inst", [], "cmp-card");
  const r = resolveInstanceChildren(inst, defs)!;
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((n) => n.id), ["card-inst__cm-h", "card-inst__cm-b"]);
});

test("tagAsInstance / detach / count / treeHasInstances work on CARD roots [T4.4]", () => {
  const tagged = tagAsInstance(card("c"), "cmp-9") as BuilderNode & { props: { instanceOf?: string } };
  assert.equal(tagged.props.instanceOf, "cmp-9");

  const tree = [container("root", [card("ci", [heading("k", "x")], "cmp-9")])];
  assert.equal(countComponentInstances(tree, "cmp-9"), 1);
  assert.equal(treeHasInstances(tree), true);

  const { tree: next, detached } = detachComponentInstance(tree, "ci");
  assert.equal(detached, true);
  assert.equal(countComponentInstances(next, "cmp-9"), 0);
});

test("setInstanceOverride: works on a CARD instance root [T4.4]", () => {
  const tree = [card("ci", [], "cmp-1")];
  const withOv = setInstanceOverride(tree, "ci", "m-h", { text: "Hi" });
  assert.equal((withOv[0].props as { instanceOverrides: Record<string, { text: string }> }).instanceOverrides["m-h"].text, "Hi");
});

// ── Phase 4 (T4.4): VARIANTS ─────────────────────────────────────────────────

test("applyVariantToInstance: writes the variant overrides + records the variant id [T4.4]", () => {
  const tree = [instance("vi", "cmp-1")];
  const variant = {
    id: "v-dark", name: "Dark",
    overrides: { "m-h": { text: "Dark heading" }, "m-root": { style: { backgroundColor: "#111" } } },
  };
  const next = applyVariantToInstance(tree, "vi", variant);
  const props = next[0].props as {
    instanceOverrides: Record<string, BuilderNodeInstanceOverride>;
    instanceVariant: string;
  };
  assert.equal(props.instanceVariant, "v-dark");
  assert.equal(props.instanceOverrides["m-h"].text, "Dark heading");
  assert.equal(props.instanceOverrides["m-root"].style!.backgroundColor, "#111");
});

test("applyVariantToInstance: prunes empty overrides + replaces a prior variant's map [T4.4]", () => {
  const tree = [instance("vi", "cmp-1", { "stale": { text: "old" } })];
  const variant = {
    id: "v-min", name: "Minimal",
    overrides: { "m-h": { text: "Only this" }, "ignored": { text: "" }, "ignored2": { style: {} } },
  };
  const next = applyVariantToInstance(tree, "vi", variant);
  const ov = (next[0].props as { instanceOverrides: Record<string, unknown> }).instanceOverrides;
  // The stale override is gone (variant replaces wholesale); empties pruned.
  assert.deepEqual(Object.keys(ov), ["m-h"]);
});

test("applyVariantToInstance: a variant with only-empty overrides clears the map but tags the variant [T4.4]", () => {
  const tree = [instance("vi", "cmp-1", { "x": { text: "y" } })];
  const variant = { id: "v-empty", name: "Empty", overrides: { "a": { text: "" } } };
  const next = applyVariantToInstance(tree, "vi", variant);
  const props = next[0].props as { instanceOverrides?: unknown; instanceVariant: string };
  assert.equal(props.instanceOverrides, undefined);
  assert.equal(props.instanceVariant, "v-empty");
});

test("applyVariantToInstance: no-op on a non-instance / non-matching id [T4.4]", () => {
  const tree = [container("plain")];
  const next = applyVariantToInstance(tree, "plain", { id: "v", name: "V", overrides: {} });
  assert.deepEqual(next, tree);
});

test("clearInstanceVariant: drops the variant tag, keeps the overrides [T4.4]", () => {
  const seeded = applyVariantToInstance([instance("vi", "cmp-1")], "vi", {
    id: "v1", name: "V1", overrides: { "m-h": { text: "Kept" } },
  });
  const cleared = clearInstanceVariant(seeded, "vi");
  const props = cleared[0].props as {
    instanceVariant?: string;
    instanceOverrides: Record<string, { text: string }>;
  };
  assert.equal(props.instanceVariant, undefined);
  assert.equal(props.instanceOverrides["m-h"].text, "Kept");
});

test("readInstanceVariant: reads the active variant id (or null) [T4.4]", () => {
  const tagged = applyVariantToInstance([instance("vi", "cmp-1")], "vi", {
    id: "v9", name: "V9", overrides: {},
  });
  assert.equal(readInstanceVariant(tagged[0]), "v9");
  assert.equal(readInstanceVariant(instance("plain-i", "cmp-1")), null);
  assert.equal(readInstanceVariant(container("plain")), null);
});
