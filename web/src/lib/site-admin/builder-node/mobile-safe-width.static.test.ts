import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";
import { PAGE_DESIGNS } from "./page-designs";

/**
 * mobile-safe-width.static.test.ts — W3-M2 mobile-safe catalog guard.
 *
 * TWO things are locked here:
 *
 * 1. BEHAVIOUR — the renderer clamps a FREE fixed-length `width` / `minWidth`
 *    escape to `min(<value>, 100%)` once the value crosses the mobile-unsafe
 *    threshold (~360px). This is the universal fix for the live offender: an
 *    older published tree that baked a content container at `width:1120px`
 *    would force a ~390px phone to scroll horizontally; `min(1120px, 100%)`
 *    self-clamps to the parent on mobile while staying byte-identical (1120px)
 *    on a wide desktop parent. Small decorative widths and intrinsic keywords
 *    (`100%`, `max-content`, `auto`) are emitted unchanged so marquee tracks
 *    that rely on `width:max-content` + parent `overflow:hidden` keep working.
 *
 * 2. DEFAULTS — no shipped page-design DEFAULT tree emits a raw fixed-px
 *    `width`/`minWidth` at or above the threshold, so a freshly inserted /
 *    seeded section is mobile-safe out of the box (the clamp is a backstop for
 *    stale published data, not a crutch the defaults lean on).
 *
 * Renders through the REAL renderBuilderNodes path (no browser) so a future
 * change to the style-escape emit can't silently regress mobile safety.
 */

const MOBILE_UNSAFE_WIDTH_PX = 360;

/**
 * Renders the node through the real path and returns ONLY that node's own
 * inline `style="…"` attribute value — the injected <style> stylesheet (which
 * legitimately contains base rules like `max-width:1120px` and
 * `min-width:min(620px,80vw)`) must not pollute the assertions.
 */
function renderNodeInlineStyle(node: BuilderNode): string {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      renderBuilderNodes([node], {}) as unknown as React.ReactNode,
    ),
  );
  const m = new RegExp(
    `data-builder-node-id="${node.id}"[^>]*\\sstyle="([^"]*)"`,
  ).exec(html);
  assert.ok(m, `could not find inline style for node ${node.id}`);
  return m![1];
}

function containerWithStyle(style: Record<string, unknown>): BuilderNode {
  return {
    id: "builder-container-test",
    kind: "container",
    props: { layout: "stack", style },
    children: [],
  } as BuilderNode;
}

test("fixed desktop-scale width is clamped to min(value,100%) on mobile", () => {
  const html = renderNodeInlineStyle(containerWithStyle({ width: "1120px" }));
  assert.match(
    html,
    /width:min\(1120px,\s*100%\)/,
    "a baked width:1120px must emit min(1120px, 100%) so it can't overflow a phone",
  );
  // The raw un-clamped fixed width must NOT survive.
  assert.doesNotMatch(html, /width:1120px(?!,)/);
});

test("clamp also applies to minWidth", () => {
  const html = renderNodeInlineStyle(containerWithStyle({ minWidth: "800px" }));
  assert.match(html, /min-width:min\(800px,\s*100%\)/);
});

test("rem/em widths above the threshold are clamped", () => {
  // 25rem ≈ 400px > 360px threshold.
  const html = renderNodeInlineStyle(containerWithStyle({ width: "25rem" }));
  assert.match(html, /width:min\(25rem,\s*100%\)/);
});

test("intrinsic and relative width keywords are left untouched", () => {
  for (const value of ["100%", "max-content", "auto"]) {
    const html = renderNodeInlineStyle(containerWithStyle({ width: value }));
    assert.doesNotMatch(
      html,
      /width:min\(/,
      `width:${value} must not be wrapped in min() — only fixed lengths are clamped`,
    );
  }
});

test("small decorative fixed widths are NOT clamped (no snapshot churn)", () => {
  const html = renderNodeInlineStyle(containerWithStyle({ width: "30px" }));
  assert.match(html, /width:30px/);
  assert.doesNotMatch(html, /width:min\(/);
});

// ── DEFAULTS guard ────────────────────────────────────────────────────────
function walk(node: BuilderNode, visit: (n: BuilderNode) => void) {
  visit(node);
  const children = (node as { children?: BuilderNode[] }).children;
  if (Array.isArray(children)) {
    for (const child of children) walk(child, visit);
  }
}

function fixedPx(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^\s*(\d+(?:\.\d+)?)(px|rem|em)\s*$/.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "px" ? n : n * 16;
}

test("no shipped page-design DEFAULT bakes a fixed width >= mobile threshold", () => {
  const offenders: string[] = [];
  for (const design of PAGE_DESIGNS) {
    for (const root of design.tree) {
      walk(root as BuilderNode, (n) => {
        const style = (n.props as { style?: Record<string, unknown> } | undefined)
          ?.style;
        if (!style) return;
        for (const key of ["width", "minWidth"] as const) {
          const px = fixedPx(style[key]);
          if (px !== null && px >= MOBILE_UNSAFE_WIDTH_PX) {
            offenders.push(`${design.id}:${n.kind}:${key}=${String(style[key])}`);
          }
        }
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `page-design defaults must use width:100%+maxWidthFree, not a fixed px width >=${MOBILE_UNSAFE_WIDTH_PX}px. Offenders: ${offenders.join(", ")}`,
  );
});
