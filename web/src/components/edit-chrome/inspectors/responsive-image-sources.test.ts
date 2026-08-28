import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isImageSourceTier,
  nextImageSources,
  setImageSourceTiers,
} from "./responsive-image-sources";

/**
 * The four hard invariants of per-device image sources. Each of them is
 * invisible in the panel (the control reports success either way) and each is
 * a data-loss bug when broken, which is why they are pinned here rather than
 * read out of the call site.
 */

test("setting a phone image never touches the tablet image", () => {
  const current = { tablet: { src: "/tablet.jpg", mediaId: "t1" } };
  const next = nextImageSources(current, "mobile", { url: "/phone.jpg" });
  assert.deepEqual(next, {
    tablet: { src: "/tablet.jpg", mediaId: "t1" },
    mobile: { src: "/phone.jpg" },
  });
  // ...and the caller's object was not mutated on the way past.
  assert.deepEqual(current, { tablet: { src: "/tablet.jpg", mediaId: "t1" } });
});

test("clearing a tier deletes it, so the node inherits desktop again", () => {
  const current = {
    tablet: { src: "/tablet.jpg" },
    mobile: { src: "/phone.jpg" },
  };
  assert.deepEqual(nextImageSources(current, "mobile", null), {
    tablet: { src: "/tablet.jpg" },
  });
  // No default is written in the cleared tier's place.
  const cleared = nextImageSources(current, "mobile", null);
  assert.equal(cleared && "mobile" in cleared, false);
});

test("clearing the last tier prunes the map back to undefined", () => {
  // A node that has been set and unset must be deep-equal to one that never
  // used the feature, or "no per-device media renders byte-identically" holds
  // only until someone tries the control once.
  const current = { mobile: { src: "/phone.jpg" } };
  assert.equal(nextImageSources(current, "mobile", null), undefined);
  assert.equal(nextImageSources(undefined, "mobile", null), undefined);
});

test("an empty url clears rather than writing a blank source", () => {
  const current = { mobile: { src: "/phone.jpg" } };
  assert.equal(nextImageSources(current, "mobile", { url: "   " }), undefined);
});

test("a media-library pick carries its asset id; a pasted url does not", () => {
  assert.deepEqual(
    nextImageSources(undefined, "mobile", { url: "/a.jpg", mediaId: "m1" }),
    { mobile: { src: "/a.jpg", mediaId: "m1" } },
  );
  assert.deepEqual(
    nextImageSources(undefined, "mobile", { url: "/a.jpg", mediaId: null }),
    { mobile: { src: "/a.jpg" } },
  );
});

test("only render-backed tiers are offered", () => {
  assert.equal(isImageSourceTier("mobile"), true);
  assert.equal(isImageSourceTier("tablet"), true);
  // `wide` / `compact` are canvas-preview-only tiers with no renderer lane —
  // offering an image swap there would save a value nothing ever reads.
  assert.equal(isImageSourceTier("wide"), false);
  assert.equal(isImageSourceTier("compact"), false);
  assert.equal(isImageSourceTier("desktop"), false);
});

test("the set-tier list ignores blank entries and reads widest first", () => {
  assert.deepEqual(
    setImageSourceTiers({ mobile: { src: "/p.jpg" }, tablet: { src: "  " } }),
    ["mobile"],
  );
  assert.deepEqual(
    setImageSourceTiers({ mobile: { src: "/p.jpg" }, tablet: { src: "/t.jpg" } }),
    ["tablet", "mobile"],
  );
  assert.deepEqual(setImageSourceTiers(undefined), []);
});
