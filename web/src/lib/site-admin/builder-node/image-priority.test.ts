/**
 * Tests for REND-3 — image node "Load priority" (eager + fetchpriority=high)
 *
 * Verifies:
 *  - priority=true  → loading="eager"  + fetchpriority="high" in rendered HTML
 *  - priority=false → loading="lazy"   + no fetchpriority attribute
 *  - priority unset → loading="lazy"   + no fetchpriority attribute (byte-stable)
 *  - Byte-stability: an existing image node without priority renders identically
 *    before and after this change (the two outputs below must match).
 *
 * No surfaceKind branch needed — the single render.tsx image path covers all
 * four public surfaces (lab / storefront / talent-profile / talent-site).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

function html(nodes: BuilderNode[]): string {
  return renderToStaticMarkup(
    createElement(Fragment, null, renderBuilderNodes(nodes)),
  );
}

// Use a same-origin path so the srcSet optimizer fires but no external React
// preload link is injected (external hosts trigger React's preload API which
// emits a separate <link> element, muddying the assertion surface).
const HERO_SRC = "/images/hero.jpg";

function imageNode(priority?: boolean, src = HERO_SRC): BuilderNode {
  return {
    id: "img-1",
    kind: "image",
    props: {
      src,
      alt: "Test hero image",
      ...(priority !== undefined ? { priority } : {}),
    },
  } as unknown as BuilderNode;
}

// Extract the <img> element from the rendered HTML so we don't accidentally
// match attributes on a <link rel="preload"> sibling emitted by React's
// preload API.
function extractImgTag(markup: string): string {
  const match = markup.match(/<img[^>]*>/);
  if (!match) throw new Error(`No <img> element found in rendered output:\n${markup.slice(0, 500)}`);
  return match[0];
}

describe("REND-3 — image node load priority", () => {
  it("priority=true emits loading=eager and fetchPriority=high on the <img>", () => {
    const tag = extractImgTag(html([imageNode(true)]));
    // React maps fetchPriority prop → fetchPriority attribute in static markup.
    assert.ok(tag.includes('loading="eager"'), `expected loading="eager" in img tag: ${tag}`);
    assert.ok(tag.includes('fetchPriority="high"'), `expected fetchPriority="high" in img tag: ${tag}`);
    // Must NOT emit lazy when priority is set.
    assert.ok(!tag.includes('loading="lazy"'), `unexpected loading="lazy" in priority=true img tag: ${tag}`);
  });

  it("priority=false emits loading=lazy and no fetchPriority on the <img>", () => {
    const tag = extractImgTag(html([imageNode(false)]));
    assert.ok(tag.includes('loading="lazy"'), `expected loading="lazy" in img tag: ${tag}`);
    assert.ok(!tag.includes('fetchPriority="high"'), `unexpected fetchPriority="high" in priority=false img tag: ${tag}`);
  });

  it("priority unset (default) emits loading=lazy and no fetchPriority on the <img>", () => {
    const tag = extractImgTag(html([imageNode()]));
    assert.ok(tag.includes('loading="lazy"'), `expected loading="lazy" in default img tag: ${tag}`);
    assert.ok(!tag.includes('fetchPriority="high"'), `unexpected fetchPriority="high" in default img tag: ${tag}`);
  });

  it("byte-stability: default image renders identically whether priority is explicitly false or unset", () => {
    const withFalse = html([imageNode(false)]);
    const withUnset = html([imageNode()]);
    assert.equal(
      withFalse,
      withUnset,
      "priority=false and priority=unset must produce identical output (default is lazy)",
    );
  });
});
