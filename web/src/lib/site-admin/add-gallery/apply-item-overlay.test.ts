import assert from "node:assert/strict";
import test from "node:test";

import {
  applyItemDataSourceDefaults,
  applyItemDefaultProps,
  deepMergeReplaceArrays,
} from "./apply-item-overlay";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

function node(props: Record<string, unknown>): BuilderNode {
  return { id: "n1", kind: "heading", props } as unknown as BuilderNode;
}

function containerNode(props: Record<string, unknown>): BuilderNode {
  return { id: "c1", kind: "container", props, children: [] } as unknown as BuilderNode;
}

// ── deepMergeReplaceArrays ────────────────────────────────────────────────────

test("deepMergeReplaceArrays merges nested objects key-by-key", () => {
  const out = deepMergeReplaceArrays(
    { style: { size: "md", tone: "muted" }, text: "Hi" },
    { style: { tone: "strong" } },
  );
  assert.deepEqual(out, {
    style: { size: "md", tone: "strong" },
    text: "Hi",
  });
});

test("deepMergeReplaceArrays REPLACES arrays wholesale (no concat)", () => {
  const out = deepMergeReplaceArrays(
    { links: [{ label: "Home" }, { label: "About" }] },
    { links: [{ label: "Contact" }] },
  );
  assert.deepEqual(out, { links: [{ label: "Contact" }] });
});

test("deepMergeReplaceArrays scalar override replaces base value", () => {
  const out = deepMergeReplaceArrays({ level: 1 }, { level: 2 });
  assert.deepEqual(out, { level: 2 });
});

test("deepMergeReplaceArrays does not mutate either input", () => {
  const base = { style: { size: "md" }, list: [1, 2] };
  const override = { style: { size: "lg" }, list: [9] };
  const beforeBase = JSON.stringify(base);
  const beforeOverride = JSON.stringify(override);
  deepMergeReplaceArrays(base, override);
  assert.equal(JSON.stringify(base), beforeBase);
  assert.equal(JSON.stringify(override), beforeOverride);
});

test("deepMergeReplaceArrays result does not alias override nested objects/arrays", () => {
  const override = { style: { size: "lg" }, tags: ["a"] };
  const out = deepMergeReplaceArrays({}, override) as {
    style: Record<string, unknown>;
    tags: unknown[];
  };
  // Mutating the result must not bleed into the override input.
  out.style.size = "xl";
  out.tags.push("b");
  assert.deepEqual(override, { style: { size: "lg" }, tags: ["a"] });
});

test("deepMergeReplaceArrays override object onto non-object base replaces it", () => {
  const out = deepMergeReplaceArrays({ style: "scalar" }, { style: { size: "sm" } });
  assert.deepEqual(out, { style: { size: "sm" } });
});

// ── applyItemDefaultProps ─────────────────────────────────────────────────────

test("applyItemDefaultProps deep-merges defaults over node props", () => {
  const result = applyItemDefaultProps(
    node({ text: "Welcome", style: { size: "md", tone: "muted" } }),
    { style: { tone: "strong" }, level: 1 },
  );
  assert.deepEqual(result.props, {
    text: "Welcome",
    style: { size: "md", tone: "strong" },
    level: 1,
  });
});

test("applyItemDefaultProps REPLACES arrays (not concat)", () => {
  const result = applyItemDefaultProps(
    node({ links: [{ label: "Home" }, { label: "About" }] }),
    { links: [{ label: "Only" }] },
  );
  assert.deepEqual((result.props as { links: unknown[] }).links, [{ label: "Only" }]);
});

test("applyItemDefaultProps is a no-op when defaults are absent", () => {
  const original = node({ text: "Welcome" });
  assert.equal(applyItemDefaultProps(original, undefined), original);
  assert.equal(applyItemDefaultProps(original, null), original);
});

test("applyItemDefaultProps is a no-op when defaults are an empty object", () => {
  const original = node({ text: "Welcome" });
  assert.equal(applyItemDefaultProps(original, {}), original);
});

test("applyItemDefaultProps does not mutate the input node or its props", () => {
  const original = node({ text: "Welcome", style: { size: "md" } });
  const before = JSON.stringify(original);
  applyItemDefaultProps(original, { style: { size: "lg" }, level: 2 });
  assert.equal(JSON.stringify(original), before);
});

test("applyItemDefaultProps handles a node with no props", () => {
  const bare = { id: "n2", kind: "heading" } as unknown as BuilderNode;
  const result = applyItemDefaultProps(bare, { text: "Hi", level: 1 });
  assert.deepEqual(result.props, { text: "Hi", level: 1 });
});

// ── applyItemDataSourceDefaults (C4) ──────────────────────────────────────────

test("applyItemDataSourceDefaults deep-merges into props.dataBinding", () => {
  const result = applyItemDataSourceDefaults(
    containerNode({
      layout: "grid",
      dataBinding: { sourceKey: "talent_roster", maxItems: 12 },
    }),
    { maxItems: 6, filterQuery: "discipline=model" },
  );
  const binding = (result.props as { dataBinding: Record<string, unknown> }).dataBinding;
  // Admin defaults win; the existing sourceKey survives the merge.
  assert.deepEqual(binding, {
    sourceKey: "talent_roster",
    maxItems: 6,
    filterQuery: "discipline=model",
  });
  // Sibling props untouched.
  assert.equal((result.props as { layout?: string }).layout, "grid");
});

test("applyItemDataSourceDefaults REPLACES arrays (pinnedIds taken wholesale)", () => {
  const result = applyItemDataSourceDefaults(
    containerNode({ dataBinding: { sourceKey: "s", pinnedIds: ["a", "b"] } }),
    { pinnedIds: ["c"] },
  );
  const binding = (result.props as { dataBinding: { pinnedIds: unknown[] } }).dataBinding;
  assert.deepEqual(binding.pinnedIds, ["c"]);
});

test("applyItemDataSourceDefaults is a no-op when defaults are absent/empty", () => {
  const original = containerNode({ dataBinding: { sourceKey: "s" } });
  assert.equal(applyItemDataSourceDefaults(original, undefined), original);
  assert.equal(applyItemDataSourceDefaults(original, null), original);
  assert.equal(applyItemDataSourceDefaults(original, {}), original);
});

test("applyItemDataSourceDefaults is a no-op on a node with no dataBinding", () => {
  // A static node (no binding) — defaults configure an existing connection, they
  // don't create one, so the node is returned unchanged.
  const original = containerNode({ layout: "stack" });
  assert.equal(applyItemDataSourceDefaults(original, { maxItems: 4 }), original);
});

test("applyItemDataSourceDefaults does not mutate the input node", () => {
  const original = containerNode({ dataBinding: { sourceKey: "s", maxItems: 12 } });
  const before = JSON.stringify(original);
  applyItemDataSourceDefaults(original, { maxItems: 4 });
  assert.equal(JSON.stringify(original), before);
});
