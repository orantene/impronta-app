import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "./types";
import { validateBuilderNodeTree } from "./validate";
import { isBuilderKitSectionRole, normalizeKitSlotKey } from "./section-provenance";

test("kit roles are namespaced; element roles and junk are not kit roles", () => {
  assert.equal(isBuilderKitSectionRole("talent.hero"), true);
  assert.equal(isBuilderKitSectionRole("talent.shell.footer"), true);
  assert.equal(isBuilderKitSectionRole("headline"), false);
  assert.equal(isBuilderKitSectionRole("Talent.Hero"), false);
  assert.equal(isBuilderKitSectionRole("talent."), false);
  assert.equal(isBuilderKitSectionRole(42), false);
});

test("normalizeKitSlotKey trims and rejects junk", () => {
  assert.equal(normalizeKitSlotKey(" hero "), "hero");
  assert.equal(normalizeKitSlotKey("hero slot"), undefined);
  assert.equal(normalizeKitSlotKey(""), undefined);
  assert.equal(normalizeKitSlotKey(null), undefined);
});

test("slotKey + kit originRole on a container survive validate (props + base mirror)", () => {
  const result = validateBuilderNodeTree([
    {
      id: "c1",
      kind: "container",
      props: { layout: "stack", slotKey: "hero", originRole: "talent.hero" },
      children: [],
    },
  ]);
  assert.equal(result.ok, true);
  const node = result.tree[0] as BuilderNode & { slotKey?: string };
  assert.equal((node.props as Record<string, unknown>).slotKey, "hero");
  assert.equal((node.props as Record<string, unknown>).originRole, "talent.hero");
  assert.equal(node.slotKey, "hero");
  assert.equal(node.originRole, "talent.hero");
});

test("a node without provenance round-trips byte-identically", () => {
  const input = [
    { id: "c1", kind: "container", props: { layout: "stack" }, children: [] },
  ];
  const result = validateBuilderNodeTree(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.tree, input);
});

test("section nodes keep their own slotKey handling (null slot untouched, no base mirror)", () => {
  const input = [
    {
      id: "s1",
      kind: "section",
      props: { sectionTypeKey: "freeform", slotKey: null },
      children: [],
    },
  ];
  const result = validateBuilderNodeTree(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.tree, input);
  assert.equal("slotKey" in (result.tree[0] as object), false);
});
