/**
 * Nail Designer renderer smoke: server HTML (no JS) carries the whole tool,
 * localises, hides when nothing is offered, and its CSS is token-only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { NAIL_DESIGNER_CSS } from "./nail-designer-css";
import { renderBuilderNodes } from "./render";
import type { BuilderAppNailDesignerNode, BuilderNode } from "./types";

function nailNode(over: Partial<BuilderAppNailDesignerNode["props"]> = {}): BuilderNode {
  const n = createBuilderNode("app_nail_designer") as BuilderAppNailDesignerNode;
  return { ...n, props: { ...n.props, ...over } } as BuilderNode;
}

function render(node: BuilderNode, locale = "en"): string {
  return renderToStaticMarkup(
    renderBuilderNodes([node], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: {},
      visitorLocale: locale,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

test("renders the whole tool as real buttons in the first paint", () => {
  const html = render(nailNode());
  assert.match(html, /data-builder-node-kind="app_nail_designer"/);
  assert.match(html, /<h2 class="sb-nd-title">Design your nails<\/h2>/);
  assert.equal((html.match(/data-nd-finger=/g) ?? []).length, 5);
  assert.equal((html.match(/data-nd-color=/g) ?? []).length, 36, "polish + accent swatches");
  for (const tab of ["Colour", "Art", "Finish", "Shape", "Extras"]) assert.match(html, new RegExp(`>${tab}<`));
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /data-nd-action="send"[^>]*>Send my design</);
  assert.match(html, /aria-label="Pinky nail"/);
});

test("Spanish visitors get Spanish chrome and the default CTA", () => {
  const html = render(nailNode({ ctaLabel: "" }), "es");
  assert.match(html, />Color</);
  assert.match(html, />Acabado</);
  assert.match(html, /Enviar mi diseño/);
  assert.match(html, /aria-label="Uña meñique"/);
});

test("send with booking off removes the CTA but keeps the tool", () => {
  const html = render(nailNode({ sendWithBooking: false }));
  assert.doesNotMatch(html, /data-nd-action="send"/);
  assert.match(html, /data-nd-action="undo"/);
});

test("only the offered options appear, and a group with none loses its tab", () => {
  const html = render(nailNode({ colors: ["cherry", "onyx"], charms: [], shapes: [] }));
  assert.equal((html.match(/data-nd-color=/g) ?? []).length, 4);
  assert.doesNotMatch(html, />Extras</);
  assert.doesNotMatch(html, />Shape</);
});

test("nothing offered renders hidden with no tool inside", () => {
  const html = render(nailNode({ shapes: [], colors: [], arts: [], finishes: [], charms: [] }));
  assert.match(html, /data-nd-empty="1"/);
  assert.match(html, /hidden/);
  assert.doesNotMatch(html, /data-nd-finger=/);
});

test("the CSS paints only from design tokens, mobile-first with a container query", () => {
  assert.doesNotMatch(NAIL_DESIGNER_CSS, /#[0-9a-fA-F]{3,8}\b/, "no hex in the app chrome");
  assert.doesNotMatch(NAIL_DESIGNER_CSS, /\b(?:rgba?|hsla?)\(/);
  assert.match(NAIL_DESIGNER_CSS, /var\(--token-color-ink\)/);
  assert.match(NAIL_DESIGNER_CSS, /@container sbnd \(min-width:760px\)/);
  assert.match(NAIL_DESIGNER_CSS, /prefers-reduced-motion:no-preference/);
});

test("the island makes no network call and keeps state local", () => {
  const src = readFileSync(new URL("./nail-designer-island.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|WebSocket|sendBeacon/);
  assert.match(src, /tulala:ask-question/);
  assert.match(src, /message/);
});
