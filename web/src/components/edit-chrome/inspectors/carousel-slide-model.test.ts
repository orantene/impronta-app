import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node";
import {
  buildCarouselSlideModels,
  pinAfterRemoval,
  singleMoveFromReorder,
  slideBackgroundUrl,
  slideIsEmpty,
  slideThumbnailUrl,
} from "./carousel-slide-model";

function imageSlide(id: string, src: string): BuilderNode {
  return { id, kind: "image", props: { src } } as unknown as BuilderNode;
}

function containerSlide(
  id: string,
  opts: { bg?: string; children?: BuilderNode[] } = {},
): BuilderNode {
  return {
    id,
    kind: "container",
    props: opts.bg ? { style: { backgroundImage: opts.bg } } : {},
    children: opts.children ?? [],
  } as unknown as BuilderNode;
}

const NAME_KIND = (node: BuilderNode) =>
  node.kind === "image" ? "" : "Container";
const FALLBACK = (position: number) => `Slide ${position}`;

test("a lone url() background is the slide's thumbnail", () => {
  assert.equal(slideBackgroundUrl('url("/a.jpg")'), "/a.jpg");
  assert.equal(slideBackgroundUrl("url(/a.jpg)"), "/a.jpg");
});

test("a gradient has no thumbnail rather than a guessed one", () => {
  // Mirrors the renderer's own bail. Showing SOME image for a gradient slide
  // would be a lie about what the slide looks like.
  assert.equal(
    slideBackgroundUrl("linear-gradient(#000, #fff), url(/a.jpg)"),
    null,
  );
  assert.equal(slideBackgroundUrl(undefined), null);
  assert.equal(slideBackgroundUrl(""), null);
});

test("the thumbnail is looked up where the RENDERER looks it up", () => {
  // An `image` child IS the Ken-Burns background layer; any other child has its
  // style.backgroundImage lifted onto that layer. Reading only one of the two
  // would show a grey box next to a slide that plainly has a photo on it.
  assert.equal(slideThumbnailUrl(imageSlide("a", "/photo.jpg")), "/photo.jpg");
  assert.equal(
    slideThumbnailUrl(containerSlide("b", { bg: "url(/bg.jpg)" })),
    "/bg.jpg",
  );
  assert.equal(slideThumbnailUrl(containerSlide("c")), null);
});

test("a slide is empty only with no picture AND no content", () => {
  assert.equal(slideIsEmpty(containerSlide("a")), true);
  assert.equal(slideIsEmpty(containerSlide("b", { bg: "url(/x.jpg)" })), false);
  assert.equal(
    slideIsEmpty(containerSlide("c", { children: [imageSlide("d", "/y.jpg")] })),
    false,
  );
});

test("an unnamed slide gets a positional label, not its node kind", () => {
  // `resolveLayerDisplayName` falls back to the kind, so every unnamed row
  // would read "Container" — a list of identical names is not a list.
  const models = buildCarouselSlideModels(
    [imageSlide("a", "/1.jpg"), containerSlide("b")],
    NAME_KIND,
    FALLBACK,
  );
  assert.equal(models[0]!.label, "Slide 1");
  assert.equal(models[1]!.label, "Container");
  assert.deepEqual(
    models.map((m) => m.position),
    [1, 2],
  );
  assert.equal(models[0]!.thumbnailUrl, "/1.jpg");
  assert.equal(models[1]!.isEmpty, true);
});

test("a reorder resolves to the ONE node that moved", () => {
  assert.deepEqual(singleMoveFromReorder(["a", "b", "c"], ["b", "a", "c"]), {
    nodeId: "b",
    toIndex: 0,
  });
  // Dragged forward: `a` ends up last.
  assert.deepEqual(singleMoveFromReorder(["a", "b", "c"], ["b", "c", "a"]), {
    nodeId: "a",
    toIndex: 2,
  });
  // Dragged backward from the end.
  assert.deepEqual(singleMoveFromReorder(["a", "b", "c"], ["c", "a", "b"]), {
    nodeId: "c",
    toIndex: 0,
  });
});

test("a reorder that is not a single move refuses to guess", () => {
  assert.equal(singleMoveFromReorder(["a", "b", "c"], ["a", "b", "c"]), null);
  assert.equal(singleMoveFromReorder(["a", "b"], ["a", "b", "c"]), null);
  // A double swap is not something DraggableList can produce; committing a
  // wrong single move would silently scramble the operator's slides.
  assert.equal(singleMoveFromReorder(["a", "b", "c", "d"], ["b", "a", "d", "c"]), null);
});

test("removing a slide leaves the pin on a slide that still exists", () => {
  // Remove the slide BEFORE the pinned one → the pin shifts down with it.
  assert.equal(pinAfterRemoval(2, 0, 4), 1);
  // Remove the slide AFTER the pinned one → the pin stays put.
  assert.equal(pinAfterRemoval(1, 3, 4), 1);
  // Remove the pinned LAST slide → clamp to the new last.
  assert.equal(pinAfterRemoval(3, 3, 4), 2);
  // Remove the only slide → 0, never negative.
  assert.equal(pinAfterRemoval(0, 0, 1), 0);
});
