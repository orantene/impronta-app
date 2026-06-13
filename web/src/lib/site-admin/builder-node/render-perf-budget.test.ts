import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BuilderNodeRendererStyles, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

/**
 * PERF-1 regression lock for the builder perf budget (P4 Lane: perf).
 *
 * The published-page perf budget (scripts/fidelity/perf-budget.ts) asserts the
 * global renderer stylesheet is emitted EXACTLY ONCE per page — every page pays
 * its ~57 KB weight, so a duplicate would silently double a fixed cost on every
 * published builder page, and a MISSING sheet would break every page's styling.
 * `render-output.test.ts` already locks the single-node and opt-out-composition
 * cases; this file locks the cases the budget actually measures: a large,
 * structurally-varied MULTI-NODE page, the production "render sections
 * independently then compose" pattern, repeater-cloned subtrees, and deep
 * nesting. Deterministic — no browser. */

const RENDERER_STYLE_MARKER = /data-builder-node-renderer-styles/g;

function render(
  nodes: BuilderNode[],
  options: Parameters<typeof renderBuilderNodes>[1] = {},
): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform", ...options }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
}

function countRendererStyles(html: string): number {
  return (html.match(RENDERER_STYLE_MARKER) ?? []).length;
}

function countNodes(html: string): number {
  return (html.match(/data-builder-node-id="/g) ?? []).length;
}

/** A structurally-varied section: nested containers, several node kinds, an image. */
function section(index: number): BuilderNode {
  return {
    id: `section-${index}`,
    kind: "container",
    props: { layout: "stack", style: { gap: "16px", paddingTop: "48px" } },
    children: [
      {
        id: `section-${index}-heading`,
        kind: "heading",
        props: { text: `Section ${index}`, level: 2 },
      },
      {
        id: `section-${index}-copy`,
        kind: "paragraph",
        props: { text: `Body copy for section ${index} with enough text to be real.` },
      },
      {
        id: `section-${index}-media`,
        kind: "container",
        props: { layout: "grid", columns: 2, style: { gap: "12px" } },
        children: [
          {
            id: `section-${index}-image`,
            kind: "image",
            props: { src: "/marketing/photos/talent-services-hero.jpg", alt: "photo" },
          },
          {
            id: `section-${index}-card`,
            kind: "card",
            props: { variant: "ghost" },
            children: [
              {
                id: `section-${index}-card-title`,
                kind: "heading",
                props: { text: `Card ${index}`, level: 3 },
              },
              {
                id: `section-${index}-card-cta`,
                kind: "button",
                props: { label: "Learn more", href: "/learn" },
              },
            ],
          },
        ],
      },
    ],
  } as BuilderNode;
}

/** A repeater container that clones its template once per collection item. */
function repeater(): BuilderNode {
  return {
    id: "repeat-grid",
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: { sourceKey: "featured_talent_profiles", mode: "bound", repeat: true, maxItems: 6 },
    },
    children: [
      {
        id: "repeat-card",
        kind: "card",
        props: {},
        children: [
          {
            id: "repeat-name",
            kind: "heading",
            props: { text: "Fallback", level: 3, fieldBindings: { text: "displayName" } },
          },
          {
            id: "repeat-photo",
            kind: "image",
            props: { src: "/fallback.jpg", alt: "talent", fieldBindings: { src: "imageUrl" } },
          },
        ],
      },
    ],
  } as BuilderNode;
}

const REPEAT_SOURCES = {
  collections: {
    featured_talent_profiles: Array.from({ length: 6 }, (_, i) => ({
      id: `talent-${i}`,
      displayName: `Talent ${i}`,
      imageUrl: `/assets/talent-${i}.jpg`,
    })),
  },
};

test("PERF-1: a large multi-node page emits the renderer stylesheet exactly once", () => {
  const page: BuilderNode[] = [
    {
      id: "page",
      kind: "container",
      props: { layout: "stack" },
      children: [...Array.from({ length: 8 }, (_, i) => section(i + 1)), repeater()],
    } as BuilderNode,
  ];

  const html = render(page, { dataSources: REPEAT_SOURCES });

  // Genuinely multi-node (8 sections × several nodes + 6 repeater clones).
  assert.ok(countNodes(html) > 60, `expected a large page, got ${countNodes(html)} nodes`);
  assert.equal(countRendererStyles(html), 1, "renderer stylesheet must emit exactly once");
  assert.ok(html.includes(".site-builder-node--container"), "the static sheet is present");
});

test("PERF-1: rendering sections independently + composing keeps one stylesheet", () => {
  // The production path: each section is rendered on its own with the renderer
  // sheet opted OUT, then the page composes them under a single shared
  // <BuilderNodeRendererStyles/>. A regression here would emit zero or N sheets.
  const sections = Array.from({ length: 10 }, (_, i) =>
    renderBuilderNodes([section(i + 1)], { mode: "freeform", includeRendererStyles: false }),
  );
  const html = renderToStaticMarkup(
    createElement(Fragment, null, createElement(BuilderNodeRendererStyles), ...sections),
  );

  assert.equal(countRendererStyles(html), 1, "exactly one shared stylesheet for the whole page");
  assert.ok(countNodes(html) > 60, "all sections rendered into the page");
});

test("PERF-1: deeply nested containers still emit one stylesheet", () => {
  let inner: BuilderNode = {
    id: "leaf",
    kind: "heading",
    props: { text: "Deep leaf", level: 4 },
  } as BuilderNode;
  for (let depth = 0; depth < 25; depth += 1) {
    inner = {
      id: `nest-${depth}`,
      kind: "container",
      props: { layout: "stack" },
      children: [inner],
    } as BuilderNode;
  }

  const html = render([inner]);
  assert.equal(countRendererStyles(html), 1, "depth must not duplicate the sheet");
});
