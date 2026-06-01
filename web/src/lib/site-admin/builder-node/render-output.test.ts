import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BuilderNodeRendererStyles, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

/**
 * Render-output regression suite — locks in that the builder's STYLE ESCAPES,
 * ENTRANCE ANIMATIONS, and Living-Components PHASE 3 resolution actually emit
 * the right CSS/markup through the real renderBuilderNodes path. Most of the
 * marathon's breadth was verified by throwaway renderToStaticMarkup scripts;
 * this makes those assertions permanent so a future change can't silently
 * regress the published render. Deterministic — no browser.
 */

function render(nodes: BuilderNode[], components?: Record<string, BuilderNode>): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      ...(components ? { components } : {}),
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function container(style: Record<string, unknown>): BuilderNode {
  return {
    id: "c1",
    kind: "container",
    props: { layout: "stack", style },
    children: [{ id: "h", kind: "heading", props: { text: "Hi", level: 2 } }],
  } as BuilderNode;
}

function countRendererStyles(html: string): number {
  return (html.match(/data-builder-node-renderer-styles/g) ?? []).length;
}

// ── Style escapes → CSS ───────────────────────────────────────────────────────

test("escapes: premium-2026 effect + interaction escapes emit correct CSS", () => {
  const html = render([
    container({
      clipPath: "circle(50%)",
      maskImage: "linear-gradient(#000,transparent)",
      textStroke: "1px #111",
      cursor: "grab",
      userSelect: "none",
      pointerEvents: "none",
      scrollSnapType: "x mandatory",
      scrollSnapAlign: "center",
    }),
  ]);
  for (const css of [
    "clip-path:circle(50%)",
    "cursor:grab",
    "scroll-snap-type:x mandatory",
    "scroll-snap-align:center",
    "pointer-events:none",
  ]) {
    assert.ok(html.includes(css), `expected ${css}`);
  }
  assert.ok(html.toLowerCase().includes("mask-image"), "mask-image");
  assert.ok(html.includes("text-stroke"), "-webkit-text-stroke");
  assert.ok(html.includes("user-select:none"), "user-select");
});

test("escapes: focus / form theming escapes emit correct CSS", () => {
  const html = render([
    container({
      outline: "2px solid #6366f1",
      outlineOffset: "2px",
      accentColor: "#ec4899",
      caretColor: "#111",
    }),
  ]);
  assert.ok(html.includes("outline:2px solid"), "outline");
  assert.ok(html.includes("outline-offset:2px"), "outline-offset");
  assert.ok(html.includes("accent-color"), "accent-color");
  assert.ok(html.includes("caret-color"), "caret-color");
});

test("escapes: surface + transform + blend escapes emit correct CSS", () => {
  const html = render([
    container({
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      opacity: 0.5,
      filter: "blur(2px)",
      backdropFilter: "blur(8px)",
      mixBlendMode: "multiply",
      rotate: "10deg",
      scale: "1.1",
      translate: "0 -4px",
      backgroundClip: "text",
    }),
  ]);
  for (const css of [
    "box-shadow:0 8px 24px",
    "opacity:0.5",
    "filter:blur(2px)",
    "mix-blend-mode:multiply",
    "rotate:10deg",
    "scale:1.1",
    "translate:0 -4px",
  ]) {
    assert.ok(html.includes(css), `expected ${css}`);
  }
  assert.ok(html.toLowerCase().includes("backdrop-filter"), "backdrop-filter");
});

// ── Entrance animation ────────────────────────────────────────────────────────

test("animation: preset + easing resolution + scroll-driven timeline", () => {
  const html = render([
    container({
      animationPreset: "rise",
      animationDuration: "0.8s",
      animationEasing: "back",
      animationTrigger: "scroll",
    }),
  ]);
  assert.match(
    html,
    /animation:bn-anim-rise 0\.8s cubic-bezier\(0\.34, ?1\.56/,
    "rise + back-easing shorthand",
  );
  assert.ok(html.includes("view()"), "scroll-driven animation-timeline");
});

test("animation: all keyframes + reduced-motion guard ship in the static sheet", () => {
  const html = render([container({ animationPreset: "fade-in" })]);
  for (const kf of [
    "@keyframes bn-anim-fade-in",
    "@keyframes bn-anim-rise",
    "@keyframes bn-anim-zoom-in",
    "@keyframes bn-anim-flip-in",
    "@keyframes bn-anim-bounce-in",
  ]) {
    assert.ok(html.includes(kf), `expected ${kf}`);
  }
  assert.ok(html.includes("prefers-reduced-motion"), "reduced-motion guard");
});

// ── Renderer stylesheet de-duplication ───────────────────────────────────────

test("renderer css: standalone render remains self-contained", () => {
  const html = render([container({})]);
  assert.equal(countRendererStyles(html), 1);
  assert.ok(html.includes(".site-builder-node--container"), "static sheet");
});

test("renderer css: page-level sheet plus opt-out renders one style tag", () => {
  const first = renderBuilderNodes([container({})], {
    mode: "freeform",
    includeRendererStyles: false,
  });
  const second = renderBuilderNodes([container({ marginTop: "s" })], {
    mode: "freeform",
    includeRendererStyles: false,
  });
  const html = renderToStaticMarkup(
    createElement(Fragment, null, createElement(BuilderNodeRendererStyles), first, second),
  );

  assert.equal(countRendererStyles(html), 1);
  assert.ok(html.includes("data-builder-node-id=\"c1\""), "first section renders");
});

// ── Living Components Phase 3 ─────────────────────────────────────────────────

const MASTER: BuilderNode = {
  id: "master", kind: "container", props: { layout: "stack" },
  children: [
    { id: "m-h", kind: "heading", props: { text: "MASTER HEADING", level: 2 } },
    { id: "m-b", kind: "button", props: { label: "Master CTA", href: "/m", tone: "primary" } },
  ],
} as BuilderNode;

function instance(id: string, overrides?: Record<string, unknown>): BuilderNode {
  return {
    id, kind: "container",
    props: { layout: "stack", instanceOf: "cmp-1", ...(overrides ? { instanceOverrides: overrides } : {}) },
    children: [{ id: `${id}-fallback`, kind: "heading", props: { text: "FALLBACK", level: 2 } }],
  } as BuilderNode;
}

test("phase3: instance resolves master LIVE + per-instance override + namespaced ids", () => {
  const html = render(
    [instance("instA"), instance("instB", { "m-h": { text: "OVERRIDDEN" } })],
    { "cmp-1": MASTER },
  );
  assert.ok(html.includes("MASTER HEADING"), "instA shows master heading live");
  assert.ok(html.includes("OVERRIDDEN"), "instB heading overridden");
  assert.ok((html.match(/Master CTA/g) || []).length >= 2, "both instances keep master CTA (structure linked)");
  assert.ok(html.includes("instA__m-h") && html.includes("instB__m-h"), "ids namespaced per instance");
  assert.ok(!html.includes("FALLBACK"), "live resolution replaces stored fallback");
});

test("phase3: missing component + no-components both fall back to stored children (never blank)", () => {
  // component map present but missing this id
  const missing = render([instance("instC")], { "other-cmp": MASTER });
  assert.ok(missing.includes("FALLBACK") && !missing.includes("MASTER HEADING"), "missing component → stored fallback");
  // no components passed at all
  const none = render([instance("instD")]);
  assert.ok(none.includes("FALLBACK") && !none.includes("MASTER HEADING"), "no components → stored fallback");
});
