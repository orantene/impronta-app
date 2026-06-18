import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIXED,
  filterBulkStylePatchForNode,
  isMixed,
  resolveMultiSelectionField,
  resolveMultiSelectionStyle,
  styleFieldLockPath,
  type MultiSelectionStyleNode,
} from "./multi-selection-style";

function node(
  id: string,
  style?: Record<string, unknown>,
  lockedProps?: string[],
): MultiSelectionStyleNode {
  return {
    id,
    kind: "heading",
    props: style ? { style: style as never } : {},
    lockedProps,
  };
}

test("resolveMultiSelectionField returns the shared value when all nodes agree", () => {
  const nodes = [
    node("a", { textColor: "#111" }),
    node("b", { textColor: "#111" }),
    node("c", { textColor: "#111" }),
  ];
  const r = resolveMultiSelectionField(nodes, "textColor");
  assert.equal(r.value, "#111");
  assert.equal(r.mixed, false);
  assert.equal(r.locked, false);
});

test("resolveMultiSelectionField returns MIXED when nodes differ", () => {
  const nodes = [
    node("a", { textColor: "#111" }),
    node("b", { textColor: "#222" }),
  ];
  const r = resolveMultiSelectionField(nodes, "textColor");
  assert.equal(r.value, MIXED);
  assert.equal(r.mixed, true);
  assert.ok(isMixed(r.value));
});

test("resolveMultiSelectionField treats an unset field on one node as MIXED", () => {
  const nodes = [node("a", { textColor: "#111" }), node("b", {})];
  const r = resolveMultiSelectionField(nodes, "textColor");
  assert.equal(r.mixed, true);
});

test("resolveMultiSelectionField — every node unset is a shared undefined, not mixed", () => {
  const nodes = [node("a", {}), node("b", {}), node("c", {})];
  const r = resolveMultiSelectionField(nodes, "textColor");
  assert.equal(r.value, undefined);
  assert.equal(r.mixed, false);
});

test("resolveMultiSelectionField — numeric opacity compares by value", () => {
  const same = resolveMultiSelectionField(
    [node("a", { opacity: 0.5 }), node("b", { opacity: 0.5 })],
    "opacity",
  );
  assert.equal(same.value, 0.5);
  assert.equal(same.mixed, false);
  const diff = resolveMultiSelectionField(
    [node("a", { opacity: 0.5 }), node("b", { opacity: 1 })],
    "opacity",
  );
  assert.equal(diff.mixed, true);
});

test("resolveMultiSelectionField flags locked when ANY node locks the field", () => {
  const nodes = [
    node("a", { textColor: "#111" }),
    node("b", { textColor: "#111" }, ["style.textColor"]),
  ];
  const r = resolveMultiSelectionField(nodes, "textColor");
  assert.equal(r.locked, true);
  // Still resolves the shared value alongside the lock flag.
  assert.equal(r.value, "#111");
});

test("resolveMultiSelectionField reads a responsive bucket when bucket is set", () => {
  const nodes = [
    node("a", { responsive: { mobile: { textColor: "#aaa" } } }),
    node("b", { responsive: { mobile: { textColor: "#aaa" } } }),
  ];
  const shared = resolveMultiSelectionField(nodes, "textColor", "mobile");
  assert.equal(shared.value, "#aaa");
  assert.equal(shared.mixed, false);
  // The base bucket is unset on both → shared undefined, not mixed.
  const base = resolveMultiSelectionField(nodes, "textColor", null);
  assert.equal(base.value, undefined);
  assert.equal(base.mixed, false);
});

test("resolveMultiSelectionField — responsive lock path keys off the bucket", () => {
  const nodes = [
    node("a", { responsive: { tablet: { textColor: "#aaa" } } }, [
      "style.responsive.tablet.textColor",
    ]),
    node("b", { responsive: { tablet: { textColor: "#aaa" } } }),
  ];
  const tablet = resolveMultiSelectionField(nodes, "textColor", "tablet");
  assert.equal(tablet.locked, true);
  // The BASE lock path is different, so base resolves unlocked.
  const base = resolveMultiSelectionField(nodes, "textColor", null);
  assert.equal(base.locked, false);
});

test("resolveMultiSelectionStyle resolves many fields into the {value,mixed} map", () => {
  const nodes = [
    node("a", { textColor: "#111", borderRadius: "8px" }),
    node("b", { textColor: "#222", borderRadius: "8px" }),
  ];
  const r = resolveMultiSelectionStyle(nodes, ["textColor", "borderRadius"]);
  assert.equal(r.textColor!.mixed, true);
  assert.equal(r.borderRadius!.mixed, false);
  assert.equal(r.borderRadius!.value, "8px");
});

test("styleFieldLockPath builds base + bucket dot-paths", () => {
  assert.equal(styleFieldLockPath("textColor", null), "style.textColor");
  assert.equal(
    styleFieldLockPath("textColor", "mobile"),
    "style.responsive.mobile.textColor",
  );
});

test("filterBulkStylePatchForNode strips keys the node locks", () => {
  const n = { lockedProps: ["style.textColor"] };
  const out = filterBulkStylePatchForNode(
    { textColor: "#fff", borderRadius: "4px" },
    n,
  );
  assert.deepEqual(out, { borderRadius: "4px" });
});

test("filterBulkStylePatchForNode passes everything through when no lock matches", () => {
  const out = filterBulkStylePatchForNode(
    { textColor: "#fff" },
    { lockedProps: ["style.backgroundColor"] },
  );
  assert.deepEqual(out, { textColor: "#fff" });
});

test("filterBulkStylePatchForNode honors a bucket-scoped lock", () => {
  const n = { lockedProps: ["style.responsive.mobile.textColor"] };
  // Base patch is untouched (different path)...
  assert.deepEqual(
    filterBulkStylePatchForNode({ textColor: "#fff" }, n, null),
    { textColor: "#fff" },
  );
  // ...but the mobile-bucket patch is stripped.
  assert.deepEqual(
    filterBulkStylePatchForNode({ textColor: "#fff" }, n, "mobile"),
    {},
  );
});
