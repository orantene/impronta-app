import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { resolveCarouselSlideForNode } from "./carousel-slide-follow";

function node(
  id: string,
  kind: string,
  children: BuilderNode[] = [],
): BuilderNode {
  return { id, kind, props: {}, children } as unknown as BuilderNode;
}

/**
 * Owner: "the z-index of the selected slider is overlay and look like a bug."
 *
 * The mechanism is geometry, not stacking. Every hero slide is
 * `position:absolute; inset:0` and inactive ones are `opacity:0` but still laid
 * out, so selecting slide 2 measured the whole hero and drew the ring on top of
 * whichever slide was visible. This resolver is what lets the canvas SHOW the
 * slide that holds the selection, so the ring outlines the thing that was
 * actually picked.
 */

test("selecting a node inside a slide resolves to that slide", () => {
  const tree: BuilderNodeTree = [
    node("hero", "carousel", [
      node("slide-1", "container", [node("h1", "heading")]),
      node("slide-2", "container", [node("h2", "heading")]),
      node("slide-3", "container", [node("h3", "heading")]),
    ]),
  ];
  assert.deepEqual(resolveCarouselSlideForNode(tree, "h3"), {
    carouselId: "hero",
    slideIndex: 2,
  });
});

test("selecting the slide node itself resolves to that slide", () => {
  // Reaching a slide from the Layers tree has to pin it too, or the navigator
  // and the canvas disagree about what is selected.
  const tree: BuilderNodeTree = [
    node("hero", "carousel", [node("slide-1", "image"), node("slide-2", "image")]),
  ];
  assert.deepEqual(resolveCarouselSlideForNode(tree, "slide-2"), {
    carouselId: "hero",
    slideIndex: 1,
  });
});

test("selecting the carousel itself does NOT pin", () => {
  // Otherwise clicking the slider to change its autoplay settings would yank
  // the canvas back to slide 0, undoing an arrow step the operator just made.
  const tree: BuilderNodeTree = [
    node("hero", "carousel", [node("slide-1", "image")]),
  ];
  assert.equal(resolveCarouselSlideForNode(tree, "hero"), null);
});

test("a selection outside every carousel resolves to nothing", () => {
  const tree: BuilderNodeTree = [
    node("section", "container", [node("copy", "paragraph")]),
    node("hero", "carousel", [node("slide-1", "image")]),
  ];
  assert.equal(resolveCarouselSlideForNode(tree, "copy"), null);
  assert.equal(resolveCarouselSlideForNode(tree, null), null);
  assert.equal(resolveCarouselSlideForNode(tree, "does-not-exist"), null);
});

test("a carousel nested inside a slide pins the INNER carousel", () => {
  // The one the operator is working in. Pinning the outer slider instead would
  // move the canvas away from the slide they are editing.
  const tree: BuilderNodeTree = [
    node("outer", "carousel", [
      node("outer-slide-0", "container"),
      node("outer-slide-1", "container", [
        node("inner", "carousel", [
          node("inner-slide-0", "image"),
          node("inner-slide-1", "image"),
        ]),
      ]),
    ]),
  ];
  assert.deepEqual(resolveCarouselSlideForNode(tree, "inner-slide-1"), {
    carouselId: "inner",
    slideIndex: 1,
  });
});

test("finds a carousel nested deep in the page tree", () => {
  const tree: BuilderNodeTree = [
    node("root", "container", [
      node("row", "split", [
        node("hero", "carousel", [
          node("slide-1", "image"),
          node("slide-2", "container", [node("cta", "button")]),
        ]),
      ]),
    ]),
  ];
  assert.deepEqual(resolveCarouselSlideForNode(tree, "cta"), {
    carouselId: "hero",
    slideIndex: 1,
  });
});
