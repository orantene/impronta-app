import test from "node:test";
import assert from "node:assert/strict";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNodeCompositionPreset } from "./composition-presets";
import {
  ANNOUNCEMENT_BAR_BACKGROUND,
  ANNOUNCEMENT_BAR_INK,
  createAnnouncementBarPreset,
} from "./composition-preset-factories-extra";
import { eventLaunchDesign } from "./page-designs";
import { builderNodeStyleAttrs, BUILDER_NODE_RENDERER_CSS, renderBuilderNodes } from "./render";
import { parseStyleTokenRef } from "./style-token-bindings";
import { validateBuilderNodeTree } from "./validate";
import type { BuilderNode } from "./types";

/**
 * announcement-bar-preset.static.test.ts — an announcement bar is NEVER a
 * white strip, and the launch-party page is NEVER a centred column.
 *
 * Two defects on improntamodels.com (2026-09-16), both fixed by contract
 * rather than by hand-editing the tenant's tree:
 *
 *   1. The `announcement-bar` preset said `background: "contrast"`, which the
 *      renderer paints as `var(--token-color-ink)` + a literal `#fff` label.
 *      On a dark theme ink is near-white: a white bar, white-on-white message,
 *      only the right-pushed CTA visible. The preset now carries its OWN
 *      token-bound ground + the derived readable ink, and a centred row.
 *
 *   2. The launch-party design's root/hero authored `width:100%;
 *      maxWidthFree:100%` and still rendered inside a 1120px column with
 *      gutters, because the page root the builder wraps a design in carries
 *      the container base cap and a child can never out-grow its parent.
 *      `fullBleed: true` is the new style contract: the renderer emits
 *      `data-builder-full-bleed` and the sheet breaks the node out to the
 *      viewport on every breakpoint.
 */

function renderNode(node: BuilderNode): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes([node], { mode: "freeform", includeRendererStyles: false }),
    ) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

test("announcement-bar: root carries an explicit token-bound background AND ink", () => {
  const bar = createAnnouncementBarPreset();
  assert.equal(bar.kind, "container");
  const style = bar.props.style ?? {};

  // Explicit paint — never a preset enum the theme can flip to white.
  assert.equal(style.background, undefined, "no `background` enum on the bar");
  assert.equal(style.backgroundColor, ANNOUNCEMENT_BAR_BACKGROUND);
  assert.equal(style.textColor, ANNOUNCEMENT_BAR_INK);
  // Both are TOKEN bindings, resolvable through the registry (not raw hex).
  const ground = parseStyleTokenRef(style.backgroundColor);
  const ink = parseStyleTokenRef(style.textColor);
  assert.ok(ground, "background is a bindable token");
  assert.ok(ink, "ink is a bindable token");
  assert.equal(ground?.key, "color.primary");
  assert.equal(ink?.key, "color.primary-on");

  // Message + CTA row: centred, single row, wraps on a phone, tap-target tall.
  assert.equal(bar.props.layout, "row");
  assert.equal(style.justifyContent, "center");
  assert.equal(style.alignItems, "center");
  assert.equal(style.align, "center");
  assert.equal(style.flexWrap, "wrap");
  assert.equal(style.minHeight, "44px");
  assert.equal(style.fullBleed, true);

  const children = bar.children ?? [];
  assert.equal(children.length, 2, "message + CTA");
  const [message, cta] = children;
  assert.equal(message?.kind, "paragraph");
  assert.equal(cta?.kind, "button");
  // Every text child paints with the bar's ink, never the page's.
  assert.equal(message?.props.style?.textColor, ANNOUNCEMENT_BAR_INK);
  assert.equal(cta?.props.style?.textColor, ANNOUNCEMENT_BAR_INK);
  // no-dead-default-cta: the seeded destination is the universal chat cue.
  assert.equal(cta && "href" in cta.props ? cta.props.href : null, "?inquiry=open");

  // The registry accepts the shape (fullBleed is a schema'd key, not a leak).
  const result = validateBuilderNodeTree([bar]);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
});

test("announcement-bar: rendered HTML paints ground + ink inline and never a #fff literal", () => {
  const html = renderNode(createBuilderNodeCompositionPreset("announcement-bar"));
  assert.match(html, /background-color:var\(--token-color-primary,/);
  assert.match(html, /color:var\(--token-color-primary-on,/);
  assert.doesNotMatch(html, /color:#fff\b/);
  assert.match(html, /justify-content:center/);
  assert.match(html, /data-builder-full-bleed=""/);
});

test("fullBleed: renderer emits the presence attr and the sheet breaks the node out to the viewport", () => {
  const attrs = builderNodeStyleAttrs({ fullBleed: true });
  assert.equal(attrs["data-builder-full-bleed"], "");
  assert.equal(builderNodeStyleAttrs({ maxWidthFree: "100%" })["data-builder-full-bleed"], undefined);

  // Doubled class (0,3,0) so it out-ranks every responsive lane on every
  // breakpoint; 100vw + symmetric negative margins is the breakout itself.
  assert.match(
    BUILDER_NODE_RENDERER_CSS,
    /\.site-builder-node\.site-builder-node\[data-builder-full-bleed\]\{width:100vw!important;max-width:100vw!important;margin-left:calc\(50% - 50vw\)!important;margin-right:calc\(50% - 50vw\)!important\}/,
  );
});

test("event-launch: the root, the strip and the hero are full bleed", () => {
  const root = eventLaunchDesign.tree[0];
  assert.ok(root && root.kind === "container");
  assert.equal(root.props.style?.fullBleed, true, "design root");
  const [bar, hero] = root.children ?? [];
  assert.ok(bar && bar.kind === "container" && bar.id === "el-bar", "announcement strip");
  assert.equal(bar.props.style?.fullBleed, true, "announcement strip");
  assert.ok(hero && hero.kind === "container" && hero.id === "el-hero", "hero");
  assert.equal(hero.props.style?.fullBleed, true, "hero");

  // Wrapped in a bare page-root container (what the builder does on insert),
  // all three still emit the breakout attr, so the 1120px base cap on the
  // wrapper cannot gutter them.
  const wrapped: BuilderNode = {
    id: "page-root",
    kind: "container",
    props: { layout: "stack" },
    children: [root],
  };
  const html = renderNode(wrapped);
  const hits = html.match(/data-builder-full-bleed=""/g) ?? [];
  assert.ok(hits.length >= 3, `expected >=3 full-bleed nodes, got ${hits.length}`);
});
