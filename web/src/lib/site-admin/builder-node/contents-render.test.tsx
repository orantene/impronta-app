/**
 * Shared `contents`: authored chapter index with anchor links.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { CONTENTS_CSS } from "./contents-block";
import { renderBuilderNodes } from "./render";
import type { BuilderContentsNode, BuilderNode } from "./types";

function render(nodes: BuilderNode[]): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: {},
    }),
  );
}

test("contents CSS uses token vars only (no hex)", () => {
  assert.doesNotMatch(CONTENTS_CSS, /#[0-9a-fA-F]{3,8}/);
});

test("contents renders numbered roman links to anchors", () => {
  const node = createBuilderNode("contents") as BuilderContentsNode;
  Object.assign(node.props, {
    title: "Contents",
    showNumbers: true,
    numberStyle: "roman",
    items: [
      { label: "Editorial", anchor: "chapter-1" },
      { label: "Lookbook", anchor: "chapter-2" },
    ],
  });
  const html = render([node]);
  assert.match(html, /data-builder-kind="contents"/);
  assert.match(html, /data-contents-layout="index"/);
  assert.match(html, /href="#chapter-1"/);
  assert.match(html, /href="#chapter-2"/);
  assert.match(html, /Editorial/);
  assert.match(html, /Lookbook/);
  assert.match(html, />I</);
  assert.match(html, />II</);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}/);
});

test("contents normalizes messy anchors and skips empty rows", () => {
  const node = createBuilderNode("contents") as BuilderContentsNode;
  Object.assign(node.props, {
    showNumbers: false,
    items: [
      { label: "About", anchor: "About Us!" },
      { label: "  ", anchor: "empty-label" },
      { label: "Rates", anchor: "" },
    ],
  });
  const html = render([node]);
  assert.match(html, /href="#about-us"/);
  assert.doesNotMatch(html, /empty-label/);
  assert.doesNotMatch(html, /Rates/);
  assert.doesNotMatch(html, /class="sb-contents-num"/);
});

test("contents decimal number style pads indices", () => {
  const node = createBuilderNode("contents") as BuilderContentsNode;
  Object.assign(node.props, {
    showNumbers: true,
    numberStyle: "decimal",
    items: [{ label: "One", anchor: "chapter-1" }],
  });
  const html = render([node]);
  assert.match(html, />01</);
});
