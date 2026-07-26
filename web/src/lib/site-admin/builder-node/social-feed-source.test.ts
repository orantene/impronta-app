import assert from "node:assert/strict";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { BuilderNode } from "./types";

function feedNode(props: Record<string, unknown>): BuilderNode {
  return {
    id: "n1",
    kind: "social_feed",
    props: { provider: "instagram", items: [], ...props },
  } as unknown as BuilderNode;
}

function html(nodes: BuilderNode[], dataSources?: BuilderNodeRenderDataSources) {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(nodes, { publicPathPrefix: "", dataSources }),
    ),
  );
}

const AUTHORED = [
  { id: "a1", mediaUrl: "https://cdn.test/authored.jpg", mediaType: "image" as const },
];
const CACHED = [
  { id: "c1", mediaUrl: "https://cdn.test/cached.jpg", mediaType: "image" as const },
];

test("connected source renders cached items", () => {
  const out = html([feedNode({ source: "connected", items: AUTHORED })], {
    socialFeeds: { instagram: CACHED },
  });
  assert.match(out, /cached\.jpg/);
  assert.doesNotMatch(out, /authored\.jpg/);
});

test("connected source FALLS BACK to authored items when the cache is empty", () => {
  // The account may not be connected yet, or the cron may not have run. Blanking
  // a live public page in that window would be the worst outcome.
  const out = html([feedNode({ source: "connected", items: AUTHORED })], {
    socialFeeds: { instagram: [] },
  });
  assert.match(out, /authored\.jpg/);
});

test("connected source falls back when socialFeeds is absent entirely", () => {
  const out = html([feedNode({ source: "connected", items: AUTHORED })]);
  assert.match(out, /authored\.jpg/);
});

test("manual source ignores the cache even when it is populated", () => {
  const out = html([feedNode({ source: "manual", items: AUTHORED })], {
    socialFeeds: { instagram: CACHED },
  });
  assert.match(out, /authored\.jpg/);
  assert.doesNotMatch(out, /cached\.jpg/);
});

test("a connected feed reads the cache for ITS OWN provider only", () => {
  // A TikTok block must never render the tenant's Instagram cache.
  const out = html(
    [feedNode({ provider: "tiktok", source: "connected", items: AUTHORED })],
    { socialFeeds: { instagram: CACHED } },
  );
  assert.doesNotMatch(out, /cached\.jpg/);
  assert.match(out, /authored\.jpg/);
});
