import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode, BuilderNodeInstanceOverride } from "./types";
import {
  countStaleComponentInstances,
  instanceChildrenMatchMaster,
} from "./component-instance-staleness";
import {
  resolveInstanceChildren,
  syncComponentInstances,
} from "./component-instances";
import { cloneNodeWithFreshIds } from "./operations";

function container(
  id: string,
  children: BuilderNode[] = [],
  extraProps: Record<string, unknown> = {},
): BuilderNode {
  return {
    id,
    kind: "container",
    props: { layout: "stack", ...extraProps },
    children,
  } as BuilderNode;
}

function heading(id: string, text: string): BuilderNode {
  return { id, kind: "heading", props: { text, level: 2 } } as BuilderNode;
}

const MASTER_CHILDREN: BuilderNode[] = [
  container("m-a", [heading("m-h", "Hello")]),
  container("m-b"),
];

function children(node: BuilderNode): BuilderNode[] {
  return "children" in node && Array.isArray(node.children)
    ? node.children
    : [];
}

// ── instanceChildrenMatchMaster ──────────────────────────────────────────────

test("a fresh-id clone of the master is NOT stale (ids are ignored)", () => {
  const cloned = MASTER_CHILDREN.map((c) => cloneNodeWithFreshIds(c));
  assert.equal(instanceChildrenMatchMaster(cloned, MASTER_CHILDREN), true);
});

test("a content edit on the master IS detected as stale", () => {
  const cloned = MASTER_CHILDREN.map((c) => cloneNodeWithFreshIds(c));
  const editedMaster: BuilderNode[] = [
    container("m-a", [heading("m-h", "Hello EDITED")]),
    container("m-b"),
  ];
  assert.equal(instanceChildrenMatchMaster(cloned, editedMaster), false);
});

test("a structural edit (added child) on the master IS detected as stale", () => {
  const cloned = MASTER_CHILDREN.map((c) => cloneNodeWithFreshIds(c));
  const editedMaster = [...MASTER_CHILDREN, container("m-c")];
  assert.equal(instanceChildrenMatchMaster(cloned, editedMaster), false);
});

test("prop key order does not create false staleness", () => {
  const a = [
    { id: "x", kind: "heading", props: { text: "Hi", level: 2 } } as BuilderNode,
  ];
  const b = [
    { id: "y", kind: "heading", props: { level: 2, text: "Hi" } } as BuilderNode,
  ];
  assert.equal(instanceChildrenMatchMaster(a, b), true);
});

test("accordion defaultOpenItemIds: an id-remapped clone is NOT stale", () => {
  const master: BuilderNode[] = [
    {
      id: "acc",
      kind: "accordion",
      props: { defaultOpenItemIds: ["item-1"] },
      children: [
        { id: "item-1", kind: "accordion_item", props: { title: "One" }, children: [] },
      ],
    } as unknown as BuilderNode,
  ];
  const cloned = master.map((c) => cloneNodeWithFreshIds(c));
  // Sanity: the clone really did re-mint the referenced id.
  const clonedProps = cloned[0].props as { defaultOpenItemIds?: string[] };
  assert.notDeepEqual(clonedProps.defaultOpenItemIds, ["item-1"]);
  assert.equal(instanceChildrenMatchMaster(cloned, master), true);
});

test("a dangling id ref on the master converges (clone drops it, so does canonicalization)", () => {
  const master: BuilderNode[] = [
    {
      id: "tabs",
      kind: "tabs",
      props: { defaultTabId: "not-in-this-subtree" },
      children: [],
    } as unknown as BuilderNode,
  ];
  const cloned = master.map((c) => cloneNodeWithFreshIds(c));
  // cloneNodeWithFreshIds drops the unmapped ref; canonicalization must mirror
  // that, or "Sync" could never clear the stale flag for this master.
  assert.equal(instanceChildrenMatchMaster(cloned, master), true);
});

// ── countStaleComponentInstances ─────────────────────────────────────────────

test("counts instances and how many are stale, per component id", () => {
  const freshInstance = container(
    "inst-fresh",
    MASTER_CHILDREN.map((c) => cloneNodeWithFreshIds(c)),
    { instanceOf: "cmp-1" },
  );
  const staleInstance = container(
    "inst-stale",
    [container("old-shape")],
    { instanceOf: "cmp-1" },
  );
  const otherComponent = container("inst-other", [container("x")], {
    instanceOf: "cmp-2",
  });
  const tree = [container("root", [freshInstance, staleInstance, otherComponent])];

  const result = countStaleComponentInstances(tree, "cmp-1", MASTER_CHILDREN);
  assert.equal(result.instances, 2);
  assert.equal(result.stale, 1);
});

test("instanceOverrides on the instance ROOT never make it count as stale", () => {
  const overrides: Record<string, BuilderNodeInstanceOverride> = {
    "m-h": { text: "Operator override" },
  };
  const instance = container(
    "inst",
    MASTER_CHILDREN.map((c) => cloneNodeWithFreshIds(c)),
    { instanceOf: "cmp-1", instanceOverrides: overrides },
  );
  const result = countStaleComponentInstances(
    [instance],
    "cmp-1",
    MASTER_CHILDREN,
  );
  assert.equal(result.instances, 1);
  assert.equal(result.stale, 0);
});

test("after syncComponentInstances, a previously-stale instance reads fresh", () => {
  const tree = [container("inst", [container("old-child")], { instanceOf: "cmp-1" })];
  assert.equal(
    countStaleComponentInstances(tree, "cmp-1", MASTER_CHILDREN).stale,
    1,
  );
  const { tree: synced } = syncComponentInstances(tree, "cmp-1", MASTER_CHILDREN);
  assert.equal(
    countStaleComponentInstances(synced, "cmp-1", MASTER_CHILDREN).stale,
    0,
  );
});

// ── Override preservation across sync (the sacred invariant) ─────────────────
//
// GUARD: if syncComponentInstances ever stops carrying the instance root's
// props through (e.g. rebuilds the node instead of spreading it), these two
// tests go red. An operator's per-instance customisations must survive any
// sync, and must still take effect on the live-resolved render afterwards.

test("sync preserves the instance's instanceOverrides map verbatim", () => {
  const overrides: Record<string, BuilderNodeInstanceOverride> = {
    "m-h": { text: "Custom title", style: { color: "#111827" } },
  };
  const tree = [
    container("inst", [container("stale-old")], {
      instanceOf: "cmp-1",
      instanceOverrides: overrides,
      instanceVariant: "variant-7",
    }),
  ];
  const { tree: synced, synced: count } = syncComponentInstances(
    tree,
    "cmp-1",
    MASTER_CHILDREN,
  );
  assert.equal(count, 1);
  const inst = synced[0];
  const props = inst.props as {
    instanceOf?: string;
    instanceVariant?: string;
    instanceOverrides?: Record<string, BuilderNodeInstanceOverride>;
  };
  assert.equal(props.instanceOf, "cmp-1");
  assert.equal(props.instanceVariant, "variant-7");
  assert.deepEqual(props.instanceOverrides, overrides);
  // The children themselves were refreshed from the master.
  assert.equal(children(inst).length, MASTER_CHILDREN.length);
});

test("after sync, the live-resolved render still applies the override", () => {
  const overrides: Record<string, BuilderNodeInstanceOverride> = {
    "m-h": { text: "Custom title" },
  };
  const tree = [
    container("inst", [container("stale-old")], {
      instanceOf: "cmp-1",
      instanceOverrides: overrides,
    }),
  ];
  const { tree: synced } = syncComponentInstances(tree, "cmp-1", MASTER_CHILDREN);
  const master = container("cmp-root", MASTER_CHILDREN);
  const resolved = resolveInstanceChildren(synced[0], { "cmp-1": master });
  assert.ok(resolved, "instance must resolve against its master");
  const texts: string[] = [];
  const walk = (n: BuilderNode): void => {
    const p = n.props as { text?: string };
    if (typeof p.text === "string") texts.push(p.text);
    children(n).forEach(walk);
  };
  resolved.forEach(walk);
  assert.ok(
    texts.includes("Custom title"),
    `override text must survive sync + live resolution (saw: ${texts.join(", ")})`,
  );
  assert.ok(!texts.includes("Hello"), "master default must be overridden");
});
