import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBuilderFieldMapPreview,
  firstRepeatItemFromRecords,
  nodeKindSupportsFieldMap,
  readNodeFieldBindings,
} from "./field-map";
import type { BuilderNode } from "./types";

function heading(props: Record<string, unknown>): BuilderNode {
  return { id: "h1", kind: "heading", props: { level: 3, ...props } } as BuilderNode;
}
function button(props: Record<string, unknown>): BuilderNode {
  return { id: "b1", kind: "button", props } as BuilderNode;
}
function image(props: Record<string, unknown>): BuilderNode {
  return { id: "i1", kind: "image", props } as BuilderNode;
}

// ── readNodeFieldBindings ────────────────────────────────────────────────────

test("readNodeFieldBindings keeps only kind-supported, non-empty props", () => {
  const node = button({
    label: "Book",
    fieldBindings: { label: "displayName", href: "href", alt: "ignored", junk: 1 },
  });
  // button supports label + href; alt is not a button prop and must drop.
  assert.deepEqual(readNodeFieldBindings(node), {
    label: "displayName",
    href: "href",
  });
});

test("readNodeFieldBindings returns {} when there are no bindings", () => {
  assert.deepEqual(readNodeFieldBindings(heading({ text: "Hi" })), {});
});

// ── firstRepeatItemFromRecords ───────────────────────────────────────────────

test("firstRepeatItemFromRecords stringifies the FIRST row's fields", () => {
  const item = firstRepeatItemFromRecords("collection:team", [
    { id: "r1", name: "Ana", years: 8, lead: true, tags: ["a", "b"] },
    { id: "r2", name: "Beto" },
  ]);
  assert.ok(item);
  assert.equal(item?.index, 0);
  assert.equal(item?.fields.name, "Ana");
  assert.equal(item?.fields.years, "8");
  assert.equal(item?.fields.lead, "true");
  assert.equal(item?.fields.tags, "a, b");
});

test("firstRepeatItemFromRecords returns null on no rows", () => {
  assert.equal(firstRepeatItemFromRecords("k", []), null);
  assert.equal(firstRepeatItemFromRecords("k", undefined), null);
});

// ── buildBuilderFieldMapPreview — the live first-row preview ──────────────────

test("preview resolves bound props from the first row + flags bound", () => {
  const node = heading({ text: "Fallback", fieldBindings: { text: "name" } });
  const item = firstRepeatItemFromRecords("collection:team", [
    { id: "r1", name: "Ana Director" },
  ]);
  const preview = buildBuilderFieldMapPreview(node, item);
  assert.equal(preview.hasRow, true);
  const textRow = preview.rows.find((r) => r.prop === "text");
  assert.equal(textRow?.boundField, "name");
  assert.equal(textRow?.resolvedValue, "Ana Director");
  assert.equal(textRow?.bound, true);
});

test("preview falls back to the manual value when a prop is not bound", () => {
  const node = heading({ text: "Manual title" });
  const item = firstRepeatItemFromRecords("k", [{ id: "r1", name: "Ana" }]);
  const preview = buildBuilderFieldMapPreview(node, item);
  const textRow = preview.rows.find((r) => r.prop === "text");
  assert.equal(textRow?.boundField, null);
  assert.equal(textRow?.resolvedValue, "Manual title");
  assert.equal(textRow?.bound, false);
});

test("preview resolves an inline {{token}} fallback even without an explicit binding", () => {
  // A node whose manual value embeds a token still resolves against the row.
  const node = heading({ text: "Meet {{name}}" });
  const item = firstRepeatItemFromRecords("k", [{ id: "r1", name: "Ana" }]);
  const preview = buildBuilderFieldMapPreview(node, item);
  const textRow = preview.rows.find((r) => r.prop === "text");
  assert.equal(textRow?.resolvedValue, "Meet Ana");
  assert.equal(textRow?.bound, true);
});

test("preview with NO row lists every connectable prop with hasRow false", () => {
  const node = button({ label: "Book now", href: "/x" });
  const preview = buildBuilderFieldMapPreview(node, null);
  assert.equal(preview.hasRow, false);
  assert.deepEqual(
    preview.rows.map((r) => r.prop),
    ["label", "href"],
  );
  const labelRow = preview.rows.find((r) => r.prop === "label");
  assert.equal(labelRow?.resolvedValue, "Book now");
  assert.equal(labelRow?.bound, false);
});

test("image preview covers src + alt props", () => {
  const node = image({
    src: "/fallback.jpg",
    alt: "alt fallback",
    fieldBindings: { src: "photo", alt: "name" },
  });
  const item = firstRepeatItemFromRecords("k", [
    { id: "r1", photo: "/ana.jpg", name: "Ana" },
  ]);
  const preview = buildBuilderFieldMapPreview(node, item);
  const srcRow = preview.rows.find((r) => r.prop === "src");
  const altRow = preview.rows.find((r) => r.prop === "alt");
  assert.equal(srcRow?.resolvedValue, "/ana.jpg");
  assert.equal(srcRow?.bound, true);
  assert.equal(altRow?.resolvedValue, "Ana");
});

// ── kind support ─────────────────────────────────────────────────────────────

test("nodeKindSupportsFieldMap is true for text/button/image, false for layout", () => {
  assert.equal(nodeKindSupportsFieldMap("heading"), true);
  assert.equal(nodeKindSupportsFieldMap("button"), true);
  assert.equal(nodeKindSupportsFieldMap("image"), true);
  assert.equal(nodeKindSupportsFieldMap("container"), false);
  assert.equal(nodeKindSupportsFieldMap("section"), false);
});
