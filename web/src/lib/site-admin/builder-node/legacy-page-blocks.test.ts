import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isFreeformBlocks,
  convertLegacyPageBlocksToBuilderNodes,
} from "./legacy-page-blocks";
import { validateBuilderNodeTree } from "./validate";
import type { PageBlock } from "@/components/page-builder/blocks/types";

// ── isFreeformBlocks ─────────────────────────────────────────────────────────

test("isFreeformBlocks: a real legacy PageBlock[] routes to the legacy renderer", () => {
  // These are the exact shapes the retired `PageBuilderPage` editor wrote (see
  // its `defaultBlock()` factory) and that `BlocksRenderer` renders publicly.
  const legacy: PageBlock[] = [
    { type: "hero", heading: "Welcome", subheading: "", ctaLabel: "Get in touch", ctaHref: "/contact" },
    { type: "text", content: "Add your text here." },
    { type: "image", url: "https://cdn.example/x.jpg", alt: "" },
    { type: "gallery", images: [{ url: "https://cdn.example/a.jpg" }] },
    { type: "roster", heading: "Our team", maxItems: 8 },
    { type: "cta", heading: "Ready?", buttonLabel: "Contact us", buttonHref: "/contact" },
  ];
  assert.equal(isFreeformBlocks(legacy), false);
});

test("isFreeformBlocks: each individual legacy block type → false (legacy path)", () => {
  for (const block of [
    { type: "hero", heading: "h" },
    { type: "text", content: "t" },
    { type: "image", url: "u" },
    { type: "gallery", images: [] },
    { type: "roster" },
    { type: "cta", heading: "h", buttonLabel: "b", buttonHref: "/" },
  ]) {
    assert.equal(isFreeformBlocks([block]), false, JSON.stringify(block));
  }
});

test("isFreeformBlocks: a freeform BuilderNode[] routes to renderBuilderNodes", () => {
  const freeform = [
    { id: "builder-heading-1", kind: "heading", props: { text: "Hi", level: 1 } },
    { id: "builder-paragraph-2", kind: "paragraph", props: { text: "Body" } },
    {
      id: "builder-container-3",
      kind: "container",
      props: { layout: "stack" },
      children: [{ id: "builder-image-4", kind: "image", props: { src: "u" } }],
    },
  ];
  assert.equal(isFreeformBlocks(freeform), true);
});

test("isFreeformBlocks: empty / non-array / null → false (legacy path, byte-safe)", () => {
  assert.equal(isFreeformBlocks([]), false);
  assert.equal(isFreeformBlocks(null), false);
  assert.equal(isFreeformBlocks(undefined), false);
  assert.equal(isFreeformBlocks({}), false);
  assert.equal(isFreeformBlocks("nope"), false);
});

test("isFreeformBlocks: mixed legacy+freeform → false (never feed half-legacy to freeform)", () => {
  const mixed = [
    { id: "builder-heading-1", kind: "heading", props: { text: "Hi", level: 1 } },
    { type: "text", content: "legacy entry" },
  ];
  assert.equal(isFreeformBlocks(mixed), false);
});

test("isFreeformBlocks: builder node missing id → false (corrupt → legacy fallback)", () => {
  const noId = [{ kind: "heading", props: { text: "Hi", level: 1 } }];
  assert.equal(isFreeformBlocks(noId), false);
});

test("isFreeformBlocks: unknown kind string → false (not a recognized freeform node)", () => {
  const unknownKind = [{ id: "x", kind: "totally_made_up", props: {} }];
  assert.equal(isFreeformBlocks(unknownKind), false);
});

// ── convertLegacyPageBlocksToBuilderNodes ────────────────────────────────────

test("converter: produces an editor-VALID freeform tree (validateBuilderNodeTree.ok)", () => {
  const legacy: PageBlock[] = [
    { type: "hero", heading: "Welcome", subheading: "Sub", imageUrl: "https://cdn/x.jpg", ctaLabel: "Go", ctaHref: "/go" },
    { type: "text", content: "Hello **world** and *italics*." },
    { type: "image", url: "https://cdn/y.jpg", alt: "Y" },
    { type: "gallery", images: [{ url: "https://cdn/a.jpg" }, { url: "https://cdn/b.jpg", alt: "B" }] },
    { type: "roster", heading: "Our team", maxItems: 8 },
    { type: "cta", heading: "Ready?", body: "Let's talk.", buttonLabel: "Contact", buttonHref: "/contact" },
  ];
  const nodes = convertLegacyPageBlocksToBuilderNodes(legacy);
  const result = validateBuilderNodeTree(nodes);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.issues),
  );
});

test("converter: a converted tree is itself classified as freeform (round-trip)", () => {
  const legacy: PageBlock[] = [{ type: "text", content: "Hi" }];
  const nodes = convertLegacyPageBlocksToBuilderNodes(legacy);
  assert.equal(isFreeformBlocks(nodes), true);
});

test("converter: preserves order + maps each block to the expected kind", () => {
  const legacy: PageBlock[] = [
    { type: "hero", heading: "H" },
    { type: "text", content: "T" },
    { type: "image", url: "u" },
    { type: "gallery", images: [] },
    { type: "roster" },
    { type: "cta", heading: "C", buttonLabel: "B", buttonHref: "/" },
  ];
  const nodes = convertLegacyPageBlocksToBuilderNodes(legacy);
  // Every block is emitted as a ROOT-VALID layout node (text/image are wrapped
  // in a container so the tree passes validateBuilderNodeTree).
  assert.deepEqual(
    nodes.map((n) => n.kind),
    ["container", "container", "container", "masonry", "section_embed", "container"],
  );
});

test("converter: hero composite nests heading/paragraph/image/button children", () => {
  const [hero] = convertLegacyPageBlocksToBuilderNodes([
    { type: "hero", heading: "Welcome", subheading: "Sub", imageUrl: "https://cdn/x.jpg", ctaLabel: "Go", ctaHref: "/go" },
  ]);
  assert.equal(hero?.kind, "container");
  const kinds = (hero as { children: Array<{ kind: string }> }).children.map((c) => c.kind);
  assert.deepEqual(kinds, ["heading", "paragraph", "image", "button"]);
});

test("converter: text block strips basic markdown markers", () => {
  const [wrapper] = convertLegacyPageBlocksToBuilderNodes([
    { type: "text", content: "Hello **bold** and *italic*." },
  ]);
  assert.equal(wrapper?.kind, "container");
  const para = (wrapper as { children: Array<{ kind: string; props: { text: string } }> }).children[0];
  assert.equal(para?.kind, "paragraph");
  assert.equal(para?.props.text, "Hello bold and italic.");
});

test("converter: roster → featured_talent section_embed with clamped limit + headline", () => {
  const [embed] = convertLegacyPageBlocksToBuilderNodes([
    { type: "roster", heading: "Our team", maxItems: 99 },
  ]);
  assert.equal(embed?.kind, "section_embed");
  const props = (embed as { props: { sectionTypeKey: string; config: Record<string, unknown> } }).props;
  assert.equal(props.sectionTypeKey, "featured_talent");
  assert.equal(props.config.headline, "Our team");
  assert.equal(props.config.limit, 15); // clamped to schema max
});

test("converter: gallery maps each image to an image child; empty gallery → empty masonry", () => {
  const [g1] = convertLegacyPageBlocksToBuilderNodes([
    { type: "gallery", images: [{ url: "a" }, { url: "b", alt: "B" }] },
  ]);
  assert.equal((g1 as { children: unknown[] }).children.length, 2);

  const [g2] = convertLegacyPageBlocksToBuilderNodes([{ type: "gallery", images: [] }]);
  assert.equal((g2 as { children: unknown[] }).children.length, 0);
  assert.equal(g2?.kind, "masonry");
});

test("converter: empty input → empty tree", () => {
  assert.deepEqual(convertLegacyPageBlocksToBuilderNodes([]), []);
});
