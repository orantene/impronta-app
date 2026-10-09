import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NAV_LANDMARK_ARIA_DEFAULT,
  navLandmarkAriaLabel,
} from "./nav-landmark-label";

test("empty / missing / English sentinel → Primary (en) or Principal (es)", () => {
  assert.equal(navLandmarkAriaLabel("en"), NAV_LANDMARK_ARIA_DEFAULT.en);
  assert.equal(navLandmarkAriaLabel("en", ""), NAV_LANDMARK_ARIA_DEFAULT.en);
  assert.equal(navLandmarkAriaLabel("en", "   "), NAV_LANDMARK_ARIA_DEFAULT.en);
  assert.equal(navLandmarkAriaLabel("en", "Primary"), NAV_LANDMARK_ARIA_DEFAULT.en);

  assert.equal(navLandmarkAriaLabel("es"), NAV_LANDMARK_ARIA_DEFAULT.es);
  assert.equal(navLandmarkAriaLabel("es", ""), NAV_LANDMARK_ARIA_DEFAULT.es);
  assert.equal(navLandmarkAriaLabel("es", "Primary"), NAV_LANDMARK_ARIA_DEFAULT.es);
});

test("custom authored labels pass through unchanged", () => {
  assert.equal(navLandmarkAriaLabel("es", "Principal"), "Principal");
  assert.equal(navLandmarkAriaLabel("es", "Main"), "Main");
  assert.equal(navLandmarkAriaLabel("en", "Site"), "Site");
});

test("unknown locales fall back to English default for the sentinel", () => {
  assert.equal(navLandmarkAriaLabel("fr", "Primary"), NAV_LANDMARK_ARIA_DEFAULT.en);
  assert.equal(navLandmarkAriaLabel(null, "Primary"), NAV_LANDMARK_ARIA_DEFAULT.en);
});
