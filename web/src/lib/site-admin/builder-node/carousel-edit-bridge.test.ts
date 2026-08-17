import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetCarouselEditBridgeForTests,
  clearCarouselSlide,
  getCarouselEditServerSnapshot,
  getCarouselEditingSnapshot,
  getCarouselPinnedServerSnapshot,
  getCarouselPinnedSlide,
  registerCarouselEditMode,
  setCarouselSlide,
  subscribeCarouselEditing,
  subscribeCarouselPinnedSlides,
} from "./carousel-edit-bridge";

/**
 * The store the slider's edit-mode behavior hangs off. Owner bug: "one slide
 * pass i cant catch the second or third one" — autoplay kept running on the
 * editor canvas.
 *
 * The load-bearing property is the one at the bottom: with NOBODY registered,
 * this store is completely inert, because the published site imports the same
 * carousel component.
 */

test.beforeEach(() => __resetCarouselEditBridgeForTests());

test("is inert until an editor canvas registers", () => {
  assert.equal(getCarouselEditingSnapshot(), false);
  assert.equal(getCarouselPinnedSlide("hero-1"), null);
});

test("registering edit mode turns autoplay off and notifies", () => {
  let notified = 0;
  subscribeCarouselEditing(() => {
    notified += 1;
  });
  const release = registerCarouselEditMode();
  assert.equal(getCarouselEditingSnapshot(), true);
  assert.equal(notified, 1);
  release();
  assert.equal(getCarouselEditingSnapshot(), false);
  assert.equal(notified, 2);
});

test("edit mode is refcounted across two canvases", () => {
  // The page body canvas and a curated section's children canvas both
  // register; whichever unmounts first must not switch autoplay back on under
  // the other one.
  const releaseA = registerCarouselEditMode();
  const releaseB = registerCarouselEditMode();
  releaseA();
  assert.equal(getCarouselEditingSnapshot(), true);
  releaseB();
  assert.equal(getCarouselEditingSnapshot(), false);
});

test("releasing twice cannot strand edit mode on", () => {
  // React StrictMode double-invokes effect cleanups in development. An
  // unguarded decrement would drive the count negative and leave `editing`
  // true — every carousel on the PUBLISHED site in the same tab would then
  // stop autoplaying.
  const releaseA = registerCarouselEditMode();
  const releaseB = registerCarouselEditMode();
  releaseA();
  releaseA();
  releaseB();
  assert.equal(getCarouselEditingSnapshot(), false);
  // And re-registering still works from a clean count.
  const releaseC = registerCarouselEditMode();
  assert.equal(getCarouselEditingSnapshot(), true);
  releaseC();
  assert.equal(getCarouselEditingSnapshot(), false);
});

test("pins are per carousel and notify only on a real change", () => {
  let notified = 0;
  subscribeCarouselPinnedSlides(() => {
    notified += 1;
  });
  setCarouselSlide("hero-1", 2);
  assert.equal(getCarouselPinnedSlide("hero-1"), 2);
  assert.equal(getCarouselPinnedSlide("hero-2"), null);
  assert.equal(notified, 1);
  setCarouselSlide("hero-1", 2);
  assert.equal(notified, 1, "re-pinning the same slide must not notify");
  setCarouselSlide("hero-1", 0);
  assert.equal(notified, 2);
});

test("a pin is normalised to a non-negative integer", () => {
  setCarouselSlide("hero-1", -3);
  assert.equal(getCarouselPinnedSlide("hero-1"), 0);
  setCarouselSlide("hero-1", 2.7);
  assert.equal(getCarouselPinnedSlide("hero-1"), 2);
});

test("clearing a pin hands the slide back to the carousel", () => {
  setCarouselSlide("hero-1", 3);
  clearCarouselSlide("hero-1");
  assert.equal(getCarouselPinnedSlide("hero-1"), null);
});

test("leaving edit mode drops every pin", () => {
  // A pin is editor state. Left behind, it would freeze a carousel on slide 3
  // for a canvas nobody is editing any more.
  const release = registerCarouselEditMode();
  setCarouselSlide("hero-1", 3);
  release();
  assert.equal(getCarouselPinnedSlide("hero-1"), null);
});

test("both server snapshots are the published behavior, by identity", () => {
  // `useSyncExternalStore` loops forever if getServerSnapshot allocates. These
  // are primitives, so identity is free — the test pins that they never become
  // objects.
  const release = registerCarouselEditMode();
  setCarouselSlide("hero-1", 4);
  assert.equal(getCarouselEditServerSnapshot(), false);
  assert.equal(getCarouselPinnedServerSnapshot(), null);
  assert.equal(
    getCarouselEditServerSnapshot(),
    getCarouselEditServerSnapshot(),
  );
  release();
});
