import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { hasRenderableBuilderNodes, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

function render(nodes: ReadonlyArray<BuilderNode>): string {
  return renderToStaticMarkup(
    createElement(Fragment, null, renderBuilderNodes(nodes, { publicPathPrefix: "/impronta" })),
  );
}

describe("renderBuilderNodes", () => {
  it("renders freeform leaf nodes with selectable builder node ids", () => {
    const html = render([
      {
        id: "free:headline",
        kind: "heading",
        props: { text: "Premium builder block", level: 2 },
      },
      {
        id: "free:copy",
        kind: "paragraph",
        props: { text: "A freeform paragraph that belongs to the builder tree." },
      },
    ]);

    assert.match(html, /data-builder-node-id="free:headline"/);
    assert.match(html, /data-builder-node-kind="heading"/);
    assert.match(html, />Premium builder block</);
    assert.match(html, /data-builder-node-id="free:copy"/);
  });

  it("skips legacy role-bound child nodes in freeform mode", () => {
    const html = render([
      {
        id: "legacy:body:0:hero:heading:headline",
        kind: "heading",
        props: { text: "Already rendered by the legacy section component", level: 1 },
      },
      {
        id: "free:extra",
        kind: "paragraph",
        props: { text: "Additional freeform content." },
      },
    ]);

    assert.doesNotMatch(html, /Already rendered by the legacy section component/);
    assert.match(html, /Additional freeform content/);
  });

  it("renders nested layout nodes and prefixes internal button hrefs", () => {
    const html = render([
      {
        id: "free:container",
        kind: "container",
        props: { layout: "stack", gap: "s" },
        children: [
          {
            id: "free:cta",
            kind: "button",
            props: { label: "Book now", href: "/contact", tone: "primary" },
          },
        ],
      },
    ]);

    assert.match(html, /data-builder-node-id="free:container"/);
    assert.match(html, /data-builder-node-id="free:cta"/);
    assert.match(html, /href="\/impronta\/contact"/);
  });

  it("renders carousel affordances from layout props", () => {
    const html = render([
      {
        id: "free:carousel",
        kind: "carousel",
        props: {
          slidesPerView: 3,
          showArrows: true,
          showDots: true,
          loop: true,
          autoplayMs: 4000,
        },
        children: [
          {
            id: "free:slide-a",
            kind: "paragraph",
            props: { text: "First slide" },
          },
          {
            id: "free:slide-b",
            kind: "paragraph",
            props: { text: "Second slide" },
          },
        ],
      },
    ]);

    assert.match(html, /data-builder-carousel-loop="true"/);
    assert.match(html, /data-builder-carousel-autoplay-ms="4000"/);
    assert.match(html, /site-builder-node--carousel-track/);
    assert.match(html, /site-builder-node--carousel-arrow/);
    assert.match(html, /site-builder-node--carousel-dot/);
    assert.match(html, /id="free:carousel-slide-1"/);
  });
});

describe("hasRenderableBuilderNodes", () => {
  it("returns false for only legacy role-bound children", () => {
    assert.equal(
      hasRenderableBuilderNodes([
        {
          id: "legacy:body:0:hero:paragraph:copy",
          kind: "paragraph",
          props: { text: "Legacy copy" },
        },
      ]),
      false,
    );
  });
});
