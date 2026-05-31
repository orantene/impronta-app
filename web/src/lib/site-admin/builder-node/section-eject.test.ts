import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode, BuilderNodeTree } from "./types";
import { ejectSectionInTree, unejectSectionInTree } from "./section-eject";

function section(
  id: string,
  children: BuilderNode[],
  ejected?: boolean,
): BuilderNode {
  return {
    id,
    kind: "section",
    props: { sectionTypeKey: "editorial_split_hero", ...(ejected ? { ejected: true } : {}) },
    children,
  } as BuilderNode;
}
function heading(id: string, text: string): BuilderNode {
  return { id, kind: "heading", props: { text, level: 2 } } as BuilderNode;
}

function allIds(tree: BuilderNodeTree): string[] {
  const out: string[] = [];
  const visit = (n: BuilderNode) => {
    out.push(n.id);
    if ("children" in n && Array.isArray(n.children)) n.children.forEach(visit);
  };
  tree.forEach(visit);
  return out;
}

test("eject: flags the section + re-mints children with fresh ROLELESS ids", () => {
  const tree = [
    section("legacy:hero:0:abc", [
      heading("legacy:hero:0:abc:heading:headline", "Hi"),
      heading("legacy:hero:0:abc:heading:sub", "Sub"),
    ]),
  ];
  const { tree: next, ejected } = ejectSectionInTree(tree, "legacy:hero:0:abc");
  assert.equal(ejected, true);
  const sec = next[0] as BuilderNode & { props: { ejected?: boolean }; children: BuilderNode[] };
  assert.equal(sec.props.ejected, true);
  assert.equal(sec.children.length, 2);
  // The role-id children are gone; new ids are roleless (no `legacy:` / `:role`).
  for (const id of allIds([sec.children[0], sec.children[1]] as BuilderNodeTree)) {
    assert.ok(!id.startsWith("legacy:"), `child id ${id} must be roleless`);
  }
  // Content preserved.
  assert.equal((sec.children[0].props as { text: string }).text, "Hi");
});

test("eject: no-op on an already-ejected or unknown section", () => {
  const already = [section("s", [heading("h", "x")], true)];
  assert.equal(ejectSectionInTree(already, "s").ejected, false);
  assert.equal(ejectSectionInTree([section("s", [])], "missing").ejected, false);
});

test("uneject: clears the flag + empties children so hydration re-derives", () => {
  const tree = [section("s", [heading("h1", "a")], true)];
  const { tree: next, ejected } = unejectSectionInTree(tree, "s");
  assert.equal(ejected, true);
  const sec = next[0] as BuilderNode & { props: { ejected?: boolean }; children: BuilderNode[] };
  assert.equal(sec.props.ejected, undefined);
  assert.equal(sec.children.length, 0);
});

test("uneject: no-op on a non-ejected section", () => {
  assert.equal(unejectSectionInTree([section("s", [])], "s").ejected, false);
});

test("eject then uneject round-trips the flag", () => {
  const tree = [section("s", [heading("h", "x")])];
  const e = ejectSectionInTree(tree, "s");
  const u = unejectSectionInTree(e.tree, "s");
  const sec = u.tree[0] as BuilderNode & { props: { ejected?: boolean } };
  assert.equal(sec.props.ejected, undefined);
});

test("original tree is not mutated (pure)", () => {
  const tree = [section("s", [heading("h", "x")])];
  const before = allIds(tree);
  ejectSectionInTree(tree, "s");
  assert.deepEqual(allIds(tree), before);
  assert.equal((tree[0].props as { ejected?: boolean }).ejected, undefined);
});

import { reconcileBuilderTreeWithLegacySlots } from "./snapshot-tree";

test("reconcile preserves the ejected flag + children when rebuilding from slots", () => {
  // An ejected section in the tree; reconcile triggers because another slot is
  // missing from the tree. The ejected section must KEEP ejected + its children
  // (else it double-renders curated + freeform).
  const tree = [
    {
      id: "legacy:body:0:sec-1",
      kind: "section",
      props: { sectionId: "sec-1", sectionTypeKey: "hero", slotKey: "body", sortOrder: 0, ejected: true },
      children: [{ id: "free-h", kind: "heading", props: { text: "Ejected", level: 2 } }],
    },
  ] as BuilderNodeTree;
  const slots = [
    { slotKey: "body", sortOrder: 0, sectionId: "sec-1", sectionTypeKey: "hero", name: "Hero", props: { title: "T" } },
    { slotKey: "body", sortOrder: 1, sectionId: "sec-2", sectionTypeKey: "cta_banner", name: "CTA", props: { label: "Go" } },
  ];
  const next = reconcileBuilderTreeWithLegacySlots(tree, slots as never);
  const sec1 = next.find(
    (n) => n.kind === "section" && (n.props as { sectionId?: string }).sectionId === "sec-1",
  ) as BuilderNode & { props: { ejected?: boolean }; children?: BuilderNode[] };
  assert.equal(sec1.props.ejected, true, "ejected flag must survive reconcile");
  assert.equal(sec1.children?.[0]?.id, "free-h", "ejected children must survive reconcile");
});
