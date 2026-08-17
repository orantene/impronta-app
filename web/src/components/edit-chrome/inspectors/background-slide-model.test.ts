/**
 * background-slide-model.test.ts — the background slideshow list's array maths.
 *
 * The cases worth pinning are the ones a click-through would not surface for
 * weeks: a duplicated image sharing its predecessor's id (which makes the two
 * rows indistinguishable to React and to the drag reorder), and a reorder that
 * silently drops or clones a slide.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { BackgroundSlideProps } from "@/lib/site-admin/builder-node/background-media";

import {
  appendBackgroundSlide,
  backgroundSlideKey,
  buildBackgroundSlideModels,
  duplicateBackgroundSlideAt,
  makeBackgroundSlideId,
  patchBackgroundSlideAt,
  pinAfterReorder,
  removeBackgroundSlideAt,
  reorderBackgroundSlides,
} from "./background-slide-model";

const slides: BackgroundSlideProps[] = [
  { id: "a", url: "/one.jpg" },
  { id: "b", url: "/two.jpg" },
  { id: "c", url: "/three.jpg" },
];

const label = (n: number) => `Image ${n}`;
const filename = (url: string) => url.split("/").pop() ?? url;

test("rows are named from the filename, falling back to the position", () => {
  const models = buildBackgroundSlideModels(
    [{ id: "a", url: "/photos/beach.jpg" }, { id: "b", url: "" }],
    label,
    filename,
  );
  assert.equal(models[0]!.label, "beach.jpg");
  assert.equal(models[1]!.label, "Image 2", "an empty row still needs a name");
  assert.equal(models[1]!.position, 2);
});

test("a slide with no id still gets a key, so legacy values render", () => {
  assert.equal(backgroundSlideKey({ url: "/x.jpg" }, 2), "idx-2");
  assert.equal(backgroundSlideKey({ id: "a", url: "/x.jpg" }, 2), "a");
});

test("append and duplicate always mint a fresh id", () => {
  const appended = appendBackgroundSlide(slides, { url: "/four.jpg" });
  assert.equal(appended.length, 4);
  assert.ok(appended[3]!.id, "a row with no id cannot be dragged reliably");

  const duped = duplicateBackgroundSlideAt(slides, 1);
  assert.equal(duped.length, 4);
  assert.equal(duped[2]!.url, "/two.jpg", "the copy lands next to its source");
  assert.notEqual(
    duped[2]!.id,
    "b",
    "a shared id makes the two rows the same row to React and to the drag",
  );
  // And the original array is untouched — every helper is a pure copy.
  assert.equal(slides.length, 3);
});

test("ids are unique across a burst of adds", () => {
  const ids = new Set(Array.from({ length: 50 }, () => makeBackgroundSlideId()));
  assert.equal(ids.size, 50);
});

test("remove and patch touch exactly one row", () => {
  assert.deepEqual(
    removeBackgroundSlideAt(slides, 1).map((s) => s.id),
    ["a", "c"],
  );
  assert.deepEqual(removeBackgroundSlideAt(slides, 9).map((s) => s.id), ["a", "b", "c"]);
  const patched = patchBackgroundSlideAt(slides, 2, { url: "/new.jpg" });
  assert.equal(patched[2]!.url, "/new.jpg");
  assert.equal(patched[2]!.id, "c", "patching must not re-key the row");
  assert.equal(patched[0]!.url, "/one.jpg");
});

test("a reorder is a permutation — never a drop, never a clone", () => {
  const next = reorderBackgroundSlides(slides, ["c", "a", "b"]);
  assert.deepEqual(next.map((s) => s.id), ["c", "a", "b"]);

  // A stale drag naming a key that no longer exists, and omitting one that
  // does, must still leave every slide present exactly once.
  const partial = reorderBackgroundSlides(slides, ["c", "ghost"]);
  assert.deepEqual(partial.map((s) => s.id), ["c", "a", "b"]);
  assert.equal(new Set(partial.map((s) => s.id)).size, 3);
});

test("the pin follows the image the operator dragged", () => {
  assert.equal(pinAfterReorder(["c", "a", "b"], "a", 0), 1);
  assert.equal(pinAfterReorder(["c", "a", "b"], "gone", 2), 2, "unknown key keeps the fallback");
});
