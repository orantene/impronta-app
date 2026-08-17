/**
 * carousel-slides-per-view.test.ts
 *
 * The load-bearing claim of the per-device slides feature is NOT that the new
 * overrides work — it is that carousels which do not use them are untouched.
 * Every carousel stored today has no `responsive` bucket, so the first block
 * below is the back-compat proof, written against the LITERAL values the
 * renderer emitted before the feature existed:
 *
 *   "--bn-slide-width": `${100 / (slidesPerView ?? 2)}%`
 *   "--bn-tablet-slides": Math.min(slidesPerView ?? 2, 2)
 *
 * plus a third assertion the old code could not make: the mobile var must be
 * `undefined`, because `builderNodeStyleVars` drops undefined entries and that
 * is what keeps the emitted style ATTRIBUTE character-identical rather than
 * merely equivalent.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-node/carousel-slides-per-view.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAROUSEL_MOBILE_DEFAULT_SLIDE_WIDTH,
  carouselSlideVars,
  cleanCarouselResponsive,
  defaultTabletSlidesPerView,
  effectiveSlidesPerView,
  hasSlidesPerViewOverride,
  slidesPerViewPatch,
} from "./carousel-slides-per-view";

// ── Back-compat: no `responsive` bucket → the pre-feature output, exactly ───

test("base-only carousels emit exactly the pre-feature vars, mobile undefined", () => {
  for (const base of [undefined, 1, 2, 3, 4] as const) {
    const props = base === undefined ? {} : { slidesPerView: base };
    const vars = carouselSlideVars(props);
    const legacyBase = base ?? 2;
    assert.equal(
      vars.slideWidth,
      `${100 / legacyBase}%`,
      `slide width drifted for base ${String(base)}`,
    );
    assert.equal(
      vars.tabletSlides,
      Math.min(legacyBase, 2),
      `tablet count drifted for base ${String(base)}`,
    );
    assert.equal(
      vars.mobileSlideWidth,
      undefined,
      "an untouched carousel must emit NO mobile var, or the style attribute changes",
    );
  }
});

test("an empty responsive bucket is still treated as no override", () => {
  const vars = carouselSlideVars({ slidesPerView: 3, responsive: {} });
  assert.equal(vars.slideWidth, `${100 / 3}%`);
  assert.equal(vars.tabletSlides, 2);
  assert.equal(vars.mobileSlideWidth, undefined);
});

test("the mobile CSS fallback literal is the shipped 86% peek", () => {
  // Pinned so a future edit to the constant has to face the fact that changing
  // it re-flows every phone rail that never opted into an override.
  assert.equal(CAROUSEL_MOBILE_DEFAULT_SLIDE_WIDTH, "86%");
});

// ── The overrides themselves ────────────────────────────────────────────────

test("a tablet override replaces the min(base, 2) fallback", () => {
  const vars = carouselSlideVars({
    slidesPerView: 4,
    responsive: { tablet: { slidesPerView: 3 } },
  });
  assert.equal(vars.slideWidth, "25%");
  assert.equal(vars.tabletSlides, 3);
  assert.equal(vars.mobileSlideWidth, undefined);
});

test("a mobile override becomes a width, and does not disturb tablet", () => {
  const vars = carouselSlideVars({
    slidesPerView: 4,
    responsive: { mobile: { slidesPerView: 2 } },
  });
  assert.equal(vars.tabletSlides, 2);
  assert.equal(vars.mobileSlideWidth, "50%");
});

test("defaultTabletSlidesPerView keeps the historical clamp", () => {
  assert.equal(defaultTabletSlidesPerView(1), 1);
  assert.equal(defaultTabletSlidesPerView(2), 2);
  assert.equal(defaultTabletSlidesPerView(4), 2);
});

// ── The inspector's readout ─────────────────────────────────────────────────

test("effectiveSlidesPerView reports what each tier actually shows", () => {
  const props = {
    slidesPerView: 4 as const,
    responsive: { tablet: { slidesPerView: 3 as const } },
  };
  assert.equal(effectiveSlidesPerView(props, null), 4);
  assert.equal(effectiveSlidesPerView(props, "tablet"), 3);
  // No mobile override → the 86% peek, honestly reported as one whole slide
  // rather than inheriting the tablet number the CSS does not apply there.
  assert.equal(effectiveSlidesPerView(props, "mobile"), 1);
  assert.equal(
    effectiveSlidesPerView(
      { ...props, responsive: { ...props.responsive, mobile: { slidesPerView: 2 } } },
      "mobile",
    ),
    2,
  );
});

test("hasSlidesPerViewOverride only fires on an explicit number", () => {
  assert.equal(hasSlidesPerViewOverride({}, "tablet"), false);
  assert.equal(hasSlidesPerViewOverride({ responsive: {} }, "mobile"), false);
  assert.equal(
    hasSlidesPerViewOverride({ responsive: { tablet: {} } }, "tablet"),
    false,
  );
  assert.equal(
    hasSlidesPerViewOverride({ responsive: { tablet: { slidesPerView: 1 } } }, "tablet"),
    true,
  );
});

// ── Patch construction ──────────────────────────────────────────────────────

test("setting one tier leaves the other alone", () => {
  const patch = slidesPerViewPatch(
    { responsive: { tablet: { slidesPerView: 3 } } },
    "mobile",
    1,
  );
  assert.deepEqual(patch, {
    responsive: { tablet: { slidesPerView: 3 }, mobile: { slidesPerView: 1 } },
  });
});

test("clearing the last override removes `responsive` entirely, not `{}`", () => {
  // An empty object survives the Zod parse and lands in the saved snapshot, so
  // "reset" has to mean absent, not present-and-empty.
  const patch = slidesPerViewPatch(
    { responsive: { mobile: { slidesPerView: 2 } } },
    "mobile",
    undefined,
  );
  assert.deepEqual(patch, { responsive: undefined });
});

test("clearing one of two overrides keeps the other", () => {
  const patch = slidesPerViewPatch(
    { responsive: { tablet: { slidesPerView: 3 }, mobile: { slidesPerView: 1 } } },
    "tablet",
    undefined,
  );
  assert.deepEqual(patch, { responsive: { mobile: { slidesPerView: 1 } } });
});

test("cleanCarouselResponsive drops empty buckets and passes undefined through", () => {
  assert.equal(cleanCarouselResponsive(undefined), undefined);
  assert.equal(cleanCarouselResponsive({}), undefined);
  assert.equal(cleanCarouselResponsive({ tablet: {}, mobile: {} }), undefined);
  assert.deepEqual(cleanCarouselResponsive({ tablet: { slidesPerView: 2 }, mobile: {} }), {
    tablet: { slidesPerView: 2 },
  });
});
