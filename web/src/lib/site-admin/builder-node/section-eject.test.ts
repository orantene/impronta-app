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

// ── Additional edge-case tests ────────────────────────────────────────────────

function container(id: string, children: BuilderNode[] = [], extra: Record<string, unknown> = {}): BuilderNode {
  return { id, kind: "container", props: { layout: "stack", ...extra }, children } as BuilderNode;
}

test("eject: section with dataBinding prop — binding survives in ejected props", () => {
  const dataBinding = { sourceKey: "talent_profiles", mode: "bound" as const, maxItems: 6 };
  const tree = [
    {
      id: "data-sec",
      kind: "section",
      props: { sectionTypeKey: "roster_grid", dataBinding },
      children: [heading("kid", "List item")],
    },
  ] as BuilderNodeTree;
  const { tree: next, ejected } = ejectSectionInTree(tree, "data-sec");
  assert.equal(ejected, true);
  const sec = next[0] as BuilderNode & { props: { dataBinding?: typeof dataBinding; ejected?: boolean } };
  assert.equal(sec.props.ejected, true);
  // The dataBinding on the section MUST survive the eject (only ejected flag is added).
  assert.deepEqual(sec.props.dataBinding, dataBinding);
});

test("eject: child container with dataBinding — binding survives re-mint via cloneNodeWithFreshIds", () => {
  const childBinding = { sourceKey: "items", mode: "bound" as const };
  const tree = [
    section("sec-db", [
      container("bound-container", [], { dataBinding: childBinding }),
    ]),
  ];
  const { tree: next } = ejectSectionInTree(tree, "sec-db");
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  const child = sec.children[0] as BuilderNode & { props: { dataBinding?: typeof childBinding } };
  // Child gets a fresh id (re-minted) but its dataBinding prop must be preserved.
  assert.notEqual(child.id, "bound-container", "child must be re-minted with a fresh id");
  assert.deepEqual(child.props.dataBinding, childBinding, "dataBinding must survive cloneNodeWithFreshIds");
});

test("eject: children already roleless (no legacy: prefix) — still re-minted with fresh ids", () => {
  const tree = [
    section("plain-sec", [
      heading("plain-h1", "No role prefix"),
      heading("plain-h2", "Also plain"),
    ]),
  ];
  const { tree: next } = ejectSectionInTree(tree, "plain-sec");
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  assert.equal(sec.children.length, 2);
  // Even though ids have no legacy: prefix, they get fresh ids.
  assert.notEqual(sec.children[0].id, "plain-h1", "roleless children must be re-minted");
  assert.notEqual(sec.children[1].id, "plain-h2", "roleless children must be re-minted");
  // But their content is preserved.
  assert.equal((sec.children[0].props as { text: string }).text, "No role prefix");
  assert.equal((sec.children[1].props as { text: string }).text, "Also plain");
});

test("eject: section with accordion child — defaultOpenItemIds correctly remapped by cloneNodeWithFreshIds", () => {
  const acc = {
    id: "legacy:sec:0:acc",
    kind: "accordion",
    props: { defaultOpenItemIds: ["legacy:sec:0:acc:item:q1", "legacy:sec:0:acc:item:q3"] },
    children: [
      { id: "legacy:sec:0:acc:item:q1", kind: "accordion_item", props: { title: "Q1" }, children: [] },
      { id: "legacy:sec:0:acc:item:q2", kind: "accordion_item", props: { title: "Q2" }, children: [] },
      { id: "legacy:sec:0:acc:item:q3", kind: "accordion_item", props: { title: "Q3" }, children: [] },
    ],
  } as BuilderNode;
  const tree = [section("legacy:sec:0:faq", [acc])];
  const { tree: next } = ejectSectionInTree(tree, "legacy:sec:0:faq");
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  const ejectedAcc = sec.children[0] as BuilderNode & {
    props: { defaultOpenItemIds: string[] };
    children: BuilderNode[];
  };
  const childIds = ejectedAcc.children.map((c) => c.id);
  // defaultOpenItemIds must reference fresh child ids, not the stale legacy ids.
  for (const openId of ejectedAcc.props.defaultOpenItemIds) {
    assert.ok(
      childIds.includes(openId),
      `defaultOpenItemIds entry "${openId}" must match an actual child id`,
    );
    assert.ok(
      !openId.startsWith("legacy:"),
      `remapped id "${openId}" must be roleless`,
    );
  }
});

test("uneject: non-existent section id returns ejected=false and tree unchanged", () => {
  const tree = [section("real-sec", [heading("h", "text")], true)];
  const { tree: next, ejected } = unejectSectionInTree(tree, "does-not-exist");
  assert.equal(ejected, false);
  // The real ejected section must remain untouched.
  assert.equal((next[0].props as { ejected?: boolean }).ejected, true);
  assert.deepEqual(allIds(next), allIds(tree));
});

test("uneject: multiple sections in tree — only the target is unejected", () => {
  const tree = [
    section("s1", [heading("h1", "A")], true),
    section("s2", [heading("h2", "B")], true),
  ];
  const { tree: next, ejected } = unejectSectionInTree(tree, "s1");
  assert.equal(ejected, true);
  assert.equal((next[0].props as { ejected?: boolean }).ejected, undefined, "s1 must be unejected");
  assert.equal((next[1].props as { ejected?: boolean }).ejected, true, "s2 must remain ejected");
});

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
