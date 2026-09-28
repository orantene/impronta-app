/**
 * W-14 `reviews` — live talent_reviews quote cards; hidden when empty.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { REVIEWS_CSS } from "./reviews-block";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { TalentSiteReview } from "./reviews-types";
import type { BuilderNode } from "./types";

function render(nodes: BuilderNode[], dataSources: BuilderNodeRenderDataSources = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function reviewsNode(props: Record<string, unknown> = {}): BuilderNode {
  const base = createBuilderNode("reviews");
  return { ...base, id: "rev-1", props: { ...base.props, ...props } } as BuilderNode;
}

function review(partial: Partial<TalentSiteReview> & { id: string }): TalentSiteReview {
  return {
    body: "She made my nails look effortless.",
    clientName: "Ana",
    rating: 5,
    createdAt: "2026-09-01T12:00:00.000Z",
    ...partial,
  };
}

test("reviews CSS uses token vars only (no hex)", () => {
  assert.doesNotMatch(REVIEWS_CSS, /#[0-9a-fA-F]{3,8}/);
});

test("reviews hides entirely when there are no quotes", () => {
  const html = render([reviewsNode()]);
  assert.match(html, /data-builder-node-kind="reviews"/);
  assert.match(html, /data-reviews-empty="1"/);
  assert.match(html, /hidden/);
  assert.doesNotMatch(html, /data-review-id=/);
});

test("reviews hides reviews with empty bodies (never invents quotes)", () => {
  const html = render([reviewsNode()], {
    talentReviews: [review({ id: "r1", body: "   " })],
  });
  assert.match(html, /data-reviews-empty="1"/);
  assert.doesNotMatch(html, /data-review-id=/);
});

test("reviews row layout emits shared carousel rail + quote cards", () => {
  const html = render(
    [reviewsNode({ layout: "row", title: "What clients say", eyebrow: "Reviews" })],
    {
      talentReviews: [
        review({ id: "r1", body: "Calm, precise, and lovely soft gel." }),
        review({ id: "r2", clientName: "Mar", body: "I rebooked the same week." }),
        review({ id: "r3", clientName: null, body: "Quiet studio, beautiful finish." }),
      ],
    },
  );
  assert.match(html, /data-builder-node-kind="reviews"/);
  assert.match(html, /data-reviews-layout="row"/);
  assert.match(html, /What clients say/);
  assert.match(html, /site-builder-node--carousel/);
  assert.match(html, /data-builder-carousel-autoplay-ms/);
  assert.match(html, /Calm, precise/);
  assert.match(html, /I rebooked/);
  assert.match(html, />Client</); // anonymous author label
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}/);
});

test("reviews trio / single layouts", () => {
  for (const layout of ["trio", "single"] as const) {
    const html = render([reviewsNode({ layout })], {
      talentReviews: [
        review({ id: "a", body: "One" }),
        review({ id: "b", body: "Two" }),
      ],
    });
    assert.match(html, new RegExp(`data-reviews-layout="${layout}"`));
    assert.match(html, /sb-reviews-quote/);
  }
});
