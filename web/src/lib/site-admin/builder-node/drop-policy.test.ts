import assert from "node:assert/strict";
import { test } from "node:test";

import { canDropBuilderNode } from "./drop-policy";

test("allows supported root node kinds", () => {
  const result = canDropBuilderNode({
    nodeKind: "section",
    parentKind: null,
  });
  assert.equal(result.ok, true);
});

test("rejects leaf node kinds at root", () => {
  const result = canDropBuilderNode({
    nodeKind: "heading",
    parentKind: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "ROOT_KIND_NOT_ALLOWED");
});

test("allows accordion item under accordion", () => {
  const result = canDropBuilderNode({
    nodeKind: "accordion_item",
    parentKind: "accordion",
  });
  assert.equal(result.ok, true);
});

test("rejects section under container by policy", () => {
  const result = canDropBuilderNode({
    nodeKind: "section",
    parentKind: "container",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "CHILD_KIND_NOT_ALLOWED");
});

test("enforces slot-level allowed kinds when provided", () => {
  const result = canDropBuilderNode({
    nodeKind: "masonry",
    parentKind: null,
    slotAllowedKinds: ["section", "container"],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "SLOT_KIND_NOT_ALLOWED");
});
