/**
 * Shared `masthead`: giant stacked words + optional B&W cover.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { MASTHEAD_CSS } from "./masthead-block";
import { renderBuilderNodes } from "./render";
import type { BuilderMastheadNode, BuilderNode } from "./types";

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

test("masthead CSS uses token vars only (no hex)", () => {
  assert.doesNotMatch(MASTHEAD_CSS, /#[0-9a-fA-F]{3,8}/);
});

test("masthead stacks words from a single line when splitWords", () => {
  const node = createBuilderNode("masthead") as BuilderMastheadNode;
  Object.assign(node.props, {
    lines: ["Lucía Herrera"],
    splitWords: true,
    showCover: true,
    coverFilter: "bw",
    coverSrc: "https://cdn.example/head.jpg",
    subline: "Model",
    creditLine: "Cover story",
  });
  const html = render([node]);
  assert.match(html, /data-builder-kind="masthead"/);
  assert.match(html, /data-masthead-cover="1"/);
  assert.match(html, /data-masthead-filter="bw"/);
  assert.match(html, /Lucía/);
  assert.match(html, /Herrera/);
  assert.match(html, /Model/);
  assert.match(html, /Cover story/);
  assert.match(html, /url\(https:\/\/cdn\.example\/head\.jpg\)/);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}/);
});

test("masthead keeps authored multi-line stack without re-splitting", () => {
  const node = createBuilderNode("masthead") as BuilderMastheadNode;
  Object.assign(node.props, {
    lines: ["Studio", "One"],
    splitWords: true,
    showCover: false,
    subline: "",
    creditLine: "",
  });
  const html = render([node]);
  assert.match(html, /data-masthead-cover="0"/);
  assert.match(html, /Studio/);
  assert.match(html, /One/);
  assert.doesNotMatch(html, /class="sb-masthead-cover"/);
});

test("masthead skips empty lines", () => {
  const node = createBuilderNode("masthead") as BuilderMastheadNode;
  Object.assign(node.props, {
    lines: ["  ", "Only"],
    splitWords: false,
    showCover: false,
  });
  const html = render([node]);
  assert.match(html, /Only/);
  assert.equal((html.match(/class="sb-masthead-line"/g) ?? []).length, 1);
});

test("magazine masthead cover statement ships with TUL-476 crop + scrim CSS", () => {
  const node = createBuilderNode("masthead") as BuilderMastheadNode;
  Object.assign(node.props, {
    edition: "magazine",
    lines: ["Mateo Ferrer"],
    splitWords: true,
    showCover: true,
    coverSrc: "https://cdn.example/mateo.jpg",
    coverLine: "Modelo",
    coverStatement: "Editorial, runway y campañas",
    bio: "Intro line for phone clearance.",
  });
  const html = render([node]);
  assert.match(html, /data-edition="magazine"/);
  assert.match(html, /Editorial, runway y campañas/);
  assert.match(html, /object-position:center 18%/);
  assert.match(html, /\.sb-mag-cover::after\{/);
  assert.match(html, /scroll-margin-top:72px/);
  assert.doesNotMatch(html, /\u2014|\u2013/);
});
