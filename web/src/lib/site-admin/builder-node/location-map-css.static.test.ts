/**
 * `location_map` on a dark theme (LUMINA audit, 2026-09-17).
 *
 * The block hard-coded light-theme ink (`rgba(18,18,18,…)`, `#f6f5f3`) for
 * the intro copy, the overlay card, the address and the city sublabels, so a
 * gold-on-black tenant rendered them invisible. On a phone the overlay card
 * (grid-area 1/1 over the map) grew taller than the 16:9 map and covered the
 * whole embed. This guards the fix the way `menu-board-css.static.test.ts`
 * guards its sheet: the map's rules, and the shared p2a copy rules it uses,
 * read tokens or `currentColor`; never a hex or rgb literal.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BUILDER_NODE_RENDERER_CSS, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

/**
 * Every rule block (`selector{declarations}`) in the shipped sheet whose
 * selector names the class, including rules nested inside an @media wrapper
 * (an at-rule header never matches: its `{` is followed by another selector).
 */
function rulesNaming(cls: string): string[] {
  const out: string[] = [];
  for (const m of BUILDER_NODE_RENDERER_CSS.matchAll(/[^{}]+\{[^{}]*\}/g)) {
    const selector = m[0].slice(0, m[0].indexOf("{"));
    if (selector.includes(cls)) out.push(m[0]);
  }
  return out;
}

const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(/i;

test("every location-map rule, and the shared p2a copy rules, paint from tokens or currentColor", () => {
  const rules = [
    ...rulesNaming("site-builder-node--location-map"),
    ...rulesNaming("site-builder-node--p2a-copy"),
    ...rulesNaming("site-builder-node--p2a-eyebrow"),
    ...rulesNaming("site-builder-node--p2a-empty"),
  ];
  assert.ok(rules.length >= 16, `expected the map's rule set, got ${rules.length}`);
  for (const rule of rules) {
    assert.doesNotMatch(rule, LITERAL, `light-theme ink literal in:\n${rule}`);
  }
});

test("the muted copy is derived from the block's own colour, so an authored textColor and a dark theme both read", () => {
  assert.match(BUILDER_NODE_RENDERER_CSS, /\.site-builder-node--p2a-copy\{[^}]*color:color-mix\(in oklab,currentColor 68%,transparent\)/);
  assert.match(BUILDER_NODE_RENDERER_CSS, /\.site-builder-node--location-map-city-region,\.site-builder-node--location-map-city-count\{[^}]*color:color-mix\(in oklab,currentColor/);
  assert.match(BUILDER_NODE_RENDERER_CSS, /\.site-builder-node--location-map-card\{[^}]*background:var\(--token-color-surface-raised,/);
  assert.match(BUILDER_NODE_RENDERER_CSS, /\.site-builder-node--location-map-card\{[^}]*color:inherit/);
});

test("under 768px the overlay card sits BELOW the map and the map keeps a 4:3 area", () => {
  const mobile = BUILDER_NODE_RENDERER_CSS.match(/@media \(max-width:767px\)\{[^\n]*site-builder-node--location-map[^\n]*\}/)?.[0];
  assert.ok(mobile, "no phone-width rule for the location map");
  assert.match(mobile, /\.site-builder-node--location-map-embed,\.site-builder-node--location-map-canvas\{aspect-ratio:4\/3\}/);
  assert.match(mobile, /\.site-builder-node--location-map\[data-bn-map-side\] \.site-builder-node--location-map-card\{grid-area:2\/1;justify-self:stretch;max-width:none;margin:0\.75rem 0 0\}/);
  // The desktop overlay keeps its place over the map.
  assert.match(BUILDER_NODE_RENDERER_CSS, /\.site-builder-node--location-map-card\{grid-area:1\/1;/);
});

function render(nodes: BuilderNode[], options: Parameters<typeof renderBuilderNodes>[1] = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform", includeRendererStyles: false, ...options }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

const map = (props: Record<string, unknown>): BuilderNode =>
  ({ id: "lm", kind: "location_map", props: { headline: "Venue", overlayTitle: "Studio", overlayAddress: "Av. 1", ...props } }) as BuilderNode;

test("a manual block with no items lists no cities (no list, no empty state); the map stays", () => {
  const html = render([map({ source: "manual", items: [] })]);
  assert.doesNotMatch(html, /site-builder-node--location-map-cities/);
  assert.doesNotMatch(html, /site-builder-node--p2a-empty/);
  assert.match(html, /site-builder-node--location-map-canvas/);
  assert.match(html, /Av\. 1/);
});

test("showCities:false hides an authored list; the default keeps it", () => {
  const items = [{ label: "Cancún", region: "Quintana Roo" }];
  assert.doesNotMatch(render([map({ source: "manual", items, showCities: false })]), /site-builder-node--location-map-cities/);
  assert.match(render([map({ source: "manual", items })]), /site-builder-node--location-map-cities/);
});

test("roster mode with nothing to show keeps its honest empty state", () => {
  const html = render([map({ source: "roster_cities", items: [] })]);
  assert.match(html, /site-builder-node--p2a-empty/);
});

test("the embed iframe renders inside the frame with the card as its sibling", () => {
  const html = render([map({ source: "manual", items: [], mapStyle: "embed", mapEmbedUrl: "https://www.google.com/maps/embed?pb=1" })]);
  assert.match(html, /<div class="site-builder-node--location-map-frame"><iframe class="site-builder-node--p2a-ratio site-builder-node--location-map-embed"/);
  assert.match(html, /site-builder-node--location-map-card"/);
});
