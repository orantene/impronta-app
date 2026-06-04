import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeNavigatorDisclosure,
  navigatorRowsWithChildren,
  navigatorSelectedAncestors,
  type NavigatorDisclosureRow,
} from "./navigator-collapse";

// A homepage-like pre-order section subtree:
//   s1(d1) > s2(d2) > [h(d3), p(d3), row(d3) > [b1(d4), b2(d4)]], sib(d1) > t(d2)
const TREE: NavigatorDisclosureRow[] = [
  { id: "s1", depth: 1 },
  { id: "s2", depth: 2 },
  { id: "h", depth: 3 },
  { id: "p", depth: 3 },
  { id: "row", depth: 3 },
  { id: "b1", depth: 4 },
  { id: "b2", depth: 4 },
  { id: "sib", depth: 1 },
  { id: "t", depth: 2 },
];

const ids = (rows: NavigatorDisclosureRow[]) => rows.map((r) => r.id);
const openNone = () => false;
const openSet = (set: Set<string>) => (id: string) => set.has(id);

// ── rows-with-children ──────────────────────────────────────────────────────

test("rowsWithChildren flags exactly the nodes that parent a deeper row", () => {
  const wc = navigatorRowsWithChildren(TREE);
  assert.deepEqual([...wc].sort(), ["row", "s1", "s2", "sib"].sort());
  // leaves never get a chevron
  for (const leaf of ["h", "p", "b1", "b2", "t"]) {
    assert.equal(wc.has(leaf), false, `${leaf} is a leaf`);
  }
});

test("rowsWithChildren on an empty / single-row list", () => {
  assert.equal(navigatorRowsWithChildren([]).size, 0);
  assert.equal(navigatorRowsWithChildren([{ id: "x", depth: 1 }]).size, 0);
});

// ── default collapse (the core fix) ─────────────────────────────────────────

test("default reveals ONLY depth-1 rows (no open ids)", () => {
  const { visible } = computeNavigatorDisclosure(TREE, openNone);
  assert.deepEqual(ids(visible), ["s1", "sib"]);
});

test("opening a node reveals exactly its direct children, still collapsed below", () => {
  const { visible } = computeNavigatorDisclosure(TREE, openSet(new Set(["s1"])));
  // s1 open → s2 shows; s2 still collapsed → its children stay hidden
  assert.deepEqual(ids(visible), ["s1", "s2", "sib"]);
});

test("opening a chain reveals the chain, siblings stay collapsed", () => {
  const { visible } = computeNavigatorDisclosure(
    TREE,
    openSet(new Set(["s1", "s2"])),
  );
  // s1+s2 open → h, p, row show; row still collapsed → b1,b2 hidden
  assert.deepEqual(ids(visible), ["s1", "s2", "h", "p", "row", "sib"]);
});

test("fully opening reveals everything", () => {
  const { visible } = computeNavigatorDisclosure(
    TREE,
    openSet(new Set(["s1", "s2", "row", "sib"])),
  );
  assert.deepEqual(ids(visible), ids(TREE));
});

test("opening a deep node WITHOUT its ancestors does not leak it", () => {
  // 'row' is open but s1/s2 are not → row is still inside a collapsed subtree.
  const { visible } = computeNavigatorDisclosure(TREE, openSet(new Set(["row"])));
  assert.deepEqual(ids(visible), ["s1", "sib"]);
});

// ── selected-ancestor reveal ────────────────────────────────────────────────

test("selectedAncestors walks the depth chain up to the section root", () => {
  // b1 is depth-4 under row(3) under s2(2) under s1(1)
  const path = navigatorSelectedAncestors(TREE, "b1");
  assert.deepEqual([...path].sort(), ["row", "s1", "s2"].sort());
});

test("selectedAncestors of a depth-1 row is empty; unknown id is empty", () => {
  assert.equal(navigatorSelectedAncestors(TREE, "s1").size, 0);
  assert.equal(navigatorSelectedAncestors(TREE, "nope").size, 0);
  assert.equal(navigatorSelectedAncestors(TREE, null).size, 0);
});

test("selecting a deep node force-reveals its whole path (never hidden)", () => {
  // Operator selects b1 with nothing manually expanded — its path must show.
  const path = navigatorSelectedAncestors(TREE, "b1");
  const { visible } = computeNavigatorDisclosure(TREE, openSet(path));
  assert.ok(ids(visible).includes("b1"), "selected node is visible");
  for (const anc of ["s1", "s2", "row"]) {
    assert.ok(ids(visible).includes(anc), `${anc} ancestor revealed`);
  }
  // the untouched sibling branch stays collapsed: sib shows (depth-1), child t hidden
  assert.equal(ids(visible).includes("sib"), true);
  assert.equal(ids(visible).includes("t"), false);
});

test("manual expand and selected-path compose (union of open ids)", () => {
  const path = navigatorSelectedAncestors(TREE, "h"); // {s1, s2} reveals the h branch
  const open = new Set([...path, "sib"]); // plus a manual expand of the sib branch
  const { visible } = computeNavigatorDisclosure(TREE, openSet(open));
  assert.ok(ids(visible).includes("h"), "selected-path branch revealed");
  assert.ok(ids(visible).includes("t"), "manually-expanded sib branch revealed");
  // 'row' stays collapsed (not opened) → b1,b2 hidden
  assert.deepEqual(ids(visible), ["s1", "s2", "h", "p", "row", "sib", "t"]);
});
