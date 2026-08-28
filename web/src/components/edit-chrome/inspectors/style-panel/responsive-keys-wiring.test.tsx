/**
 * B8 — remaining responsive keys, wired through the real viewport router
 * and the real renderer.
 *
 * Each key is patched via `styleWithViewportPatch` (the same function the
 * inspector uses) onto mobile, then `renderBuilderNodes` is asked to emit.
 * Asserts: the value landed in `responsive.mobile` AND the matching
 * presence attr + CSS var are in the markup.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type {
  BuilderNode,
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";
import {
  styleWithViewportPatch,
  type StyleCleaners,
} from "./viewport-style-patch";

const CLEANERS: StyleCleaners = {
  cleanStyle: (v) => v as BuilderNodeStyle | undefined,
  cleanValue: (v) => v as BuilderNodeStyleValue | undefined,
};

function patchMobile(
  base: BuilderNodeStyle | undefined,
  patch: Partial<BuilderNodeStyleValue>,
): BuilderNodeStyle | undefined {
  return styleWithViewportPatch(base, "mobile", "viewport", patch, CLEANERS);
}

function renderStyle(style: BuilderNodeStyle | undefined): string {
  const nodes: BuilderNode[] = [
    {
      id: "c1",
      kind: "container",
      props: { layout: "stack", style },
      children: [{ id: "h", kind: "heading", props: { text: "Hi", level: 2 } }],
    } as BuilderNode,
  ];
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform" }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
}

test("B8 lineClamp: mobile patch stores the key and the renderer emits the lane", () => {
  const next = patchMobile({ paddingTop: "24px" }, { lineClamp: 3 });
  assert.equal(next?.lineClamp, undefined, "desktop lineClamp stays unset");
  assert.equal(next?.responsive?.mobile?.lineClamp, 3);
  assert.equal(next?.paddingTop, "24px");
  const html = renderStyle(next);
  assert.ok(
    html.includes("data-builder-style-mobile-line-clamp"),
    `line-clamp attr missing in ${html.slice(0, 400)}`,
  );
  assert.ok(html.includes("--bn-mobile-line-clamp:3"));
});

test("B8 backgroundLayers: mobile patch stores the stack and emits bg-layers CSS var", () => {
  const layers = [
    { type: "color" as const, value: "rgba(0,0,0,0.4)" },
  ];
  const next = patchMobile(undefined, { backgroundLayers: layers });
  assert.deepEqual(next?.responsive?.mobile?.backgroundLayers, layers);
  assert.equal(next?.backgroundLayers, undefined);
  const html = renderStyle(next);
  assert.ok(html.includes("data-builder-style-mobile-bg-layers"));
  assert.ok(html.includes("--bn-mobile-bg-layers:linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4))"));
});

test("B8 sticky pin: mobile patch stores anchor+offset and emits sticky attrs", () => {
  const next = patchMobile(undefined, {
    stickyAnchor: "top",
    stickyOffset: "16px",
  });
  assert.equal(next?.responsive?.mobile?.stickyAnchor, "top");
  assert.equal(next?.responsive?.mobile?.stickyOffset, "16px");
  assert.equal(next?.stickyAnchor, undefined);
  const html = renderStyle(next);
  assert.ok(html.includes('data-builder-style-mobile-sticky-anchor="top"'));
  assert.ok(html.includes("--bn-mobile-sticky-offset:16px"));
});

test("B8 transitions: mobile longhands store and emit the transition lane", () => {
  const next = patchMobile(undefined, {
    transitionProperty: "opacity, transform",
    transitionDuration: ".35s",
    transitionTimingFunction: "ease-out",
    transitionDelay: "40ms",
  });
  assert.equal(next?.responsive?.mobile?.transitionProperty, "opacity, transform");
  assert.equal(next?.responsive?.mobile?.transitionDuration, ".35s");
  assert.equal(next?.transitionProperty, undefined);
  const html = renderStyle(next);
  assert.ok(html.includes("data-builder-style-mobile-transition"));
  assert.ok(html.includes("--bn-mobile-transition-property:opacity, transform"));
  assert.ok(html.includes("--bn-mobile-transition-duration:.35s"));
});

test("B5 custom tier: a wide padding write emits wide attrs + vars, not tablet", () => {
  const next = styleWithViewportPatch(
    { paddingTop: "120px" },
    "wide",
    "viewport",
    { paddingTop: "1.5rem" },
    CLEANERS,
  );
  assert.equal(next?.responsive?.wide?.paddingTop, "1.5rem");
  assert.equal(next?.paddingTop, "120px");
  const html = renderStyle(next);
  assert.ok(html.includes("data-builder-style-wide-padding-top"));
  assert.ok(html.includes("--bn-wide-padding-top:1.5rem"));
  // The static sheet contains a tablet selector; the NODE must not carry the attr.
  assert.ok(!html.includes('data-builder-style-tablet-padding-top="'));
});
