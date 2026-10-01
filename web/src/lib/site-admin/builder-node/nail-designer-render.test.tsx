/**
 * Nail Designer renderer: server HTML (no JS) carries the whole ported design
 * (tabs, swatch groups, save look, skin tone, surprise me, undo, reset, send),
 * localises, fits any width by container query, and takes its accent from the
 * site theme token.
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

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

test("the whole reference design is in the first paint", () => {
  const html = render(nailNode());
  assert.match(html, /data-builder-node-kind="app_nail_designer"/);
  assert.match(html, /Nail <em>Studio<\/em>/);
  assert.match(html, /Design a manicure, nail by nail\./);
  assert.equal(count(html, /data-nd-finger=/g), 5);
  // Polish + accent swatch groups: 18 + 18 colours (Color tab is the default).
  assert.equal(count(html, /data-nd-color=/g), 36);
  assert.equal(count(html, /data-nd-custom=/g), 2, "custom polish + custom accent pickers");
  assert.match(html, /Mix a custom polish/);
  assert.match(html, /Mix a custom accent/);
  for (const tab of ["color", "art", "finish", "shape", "extras", "looks"]) assert.match(html, new RegExp(`data-nd-tab="${tab}"`));
  for (const label of ["Color", "Art", "Finish", "Shape", "Extras", "Looks"]) assert.match(html, new RegExp(`>${label}<`));
  for (const action of ["undo", "reset", "surprise", "save", "send"]) assert.match(html, new RegExp(`data-nd-action="${action}"`));
  assert.match(html, />Surprise me</);
  assert.match(html, />Save look</);
  assert.match(html, /data-nd-action="send"[^>]*>Send my design</);
  assert.match(html, />All nails</);
  assert.match(html, /Editing · All nails/);
  assert.match(html, /Tap a nail to style it on its own/);
  assert.match(html, /aria-label="Pinky nail"/);
  // Starter saved looks show in the desktop row.
  for (const name of ["Rosé French", "Midnight Chrome", "Garden Party"]) assert.match(html, new RegExp(name));
});

test("skin tone is part of the Shape tab (reference), with six tones", () => {
  const src = readFileSync(new URL("./nail-designer-panels.tsx", import.meta.url), "utf8");
  assert.match(src, /data-nd-skin/);
  assert.match(src, /NAIL_SKINS\.map/);
  assert.match(src, /Mix a custom|customPolish/);
});

test("Spanish visitors get Spanish chrome and the default CTA", () => {
  const html = render(nailNode({ ctaLabel: "" }), "es");
  assert.match(html, />Acabado</);
  assert.match(html, /Enviar mi diseño/);
  assert.match(html, />Sorpréndeme</);
  assert.match(html, /aria-label="uña meñique"/);
});

test("optional text overrides render above the design, empty by default", () => {
  assert.doesNotMatch(render(nailNode()), /<h2 class="sb-nd-title"/);
  const html = render(nailNode({ title: "Design your nails", intro: "Try a look", ctaLabel: "Book this set" }));
  assert.match(html, /<h2 class="sb-nd-title">Design your nails<\/h2>/);
  assert.match(html, /Try a look/);
  assert.match(html, /data-nd-action="send"[^>]*>Book this set</);
});

test("the CSS is the ported design: both boards by container query, accent from the theme token", () => {
  assert.match(NAIL_DESIGNER_CSS, /@container sbnd \(min-width:980px\)/);
  assert.match(NAIL_DESIGNER_CSS, /container:sbnd\/inline-size/);
  assert.match(NAIL_DESIGNER_CSS, /--nd-accent:var\(--token-color-primary,#A63D57\)/);
  assert.match(NAIL_DESIGNER_CSS, /grid-template-columns:minmax\(0,1fr\) 420px/);
  assert.match(NAIL_DESIGNER_CSS, /height:820px/);
  assert.match(NAIL_DESIGNER_CSS, /height:844px/);
  assert.doesNotMatch(NAIL_DESIGNER_CSS, /#A63D57\b(?!\))/, "design accent only as the token fallback");
  assert.doesNotMatch(NAIL_DESIGNER_CSS, /@import|url\(|https?:\/\//, "no external network");
});

test("the island makes no network call, keeps state local, and hands off through the existing event", () => {
  const src = readFileSync(new URL("./nail-designer-island.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|WebSocket|sendBeacon/);
  assert.match(src, /tulala:ask-question/);
  assert.match(src, /message/);
});
