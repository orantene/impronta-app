/**
 * carousel-slides-per-view.ts — how many slides a rail shows, per device.
 *
 * Owner ask, verbatim: "per-device slidesPerView, yes do it".
 *
 * WHAT SHIPPED BEFORE THIS
 * ────────────────────────
 * `carousel.props.slidesPerView` was ONE number for every viewport, and the
 * renderer derived the tablet count from it with a hard-coded
 * `Math.min(base, 2)`. There was no mobile rule at all, so a phone inherited
 * the tablet rule (the tablet media query is `max-width:1024px`, which a
 * 390px phone also matches). A 4-up desktop rail was therefore always 2-up on
 * both tablet and phone, with no way to say otherwise.
 *
 * THE SHAPE, AND WHY IT IS THE EXISTING ONE
 * ─────────────────────────────────────────
 * `responsive: { tablet?: { slidesPerView? }, mobile?: { slidesPerView? } }` —
 * byte-for-byte the bucket shape `container` already uses for
 * `columns`/`display`/`itemsPerView` (`containerResponsiveSchema` in
 * registry.ts) and that `style.responsive` uses for every style field. A third
 * responsive convention in one node tree would be a third thing to learn, a
 * third thing to migrate, and a third thing for the snapshot Zod parse to
 * forget to declare.
 *
 * ADDITIVE, AND THAT IS TESTED
 * ────────────────────────────
 * The buckets are optional and each key inside them is optional. With
 * `responsive` absent — which is EVERY carousel stored today — this module
 * returns exactly the two variables the renderer emitted before
 * (`--bn-slide-width` and `--bn-tablet-slides: min(base, 2)`) and returns
 * `undefined` for the mobile one, which `builderNodeStyleVars` drops. Same
 * markup, same inline style string, byte-identical SSR.
 *
 * WHY MOBILE IS A WIDTH AND TABLET IS A COUNT
 * ───────────────────────────────────────────
 * Not symmetry for its own sake — each var matches the rule it feeds. The
 * shipped tablet rule is `flex-basis: calc(100% / var(--bn-tablet-slides, 2))`,
 * a count. The shipped mobile rule is a flat `flex-basis: 86%`: one slide with
 * the next one PEEKING, which is not any integer count and must survive
 * untouched when the author sets nothing. So the mobile var carries the
 * resolved width and the CSS keeps `86%` as its fallback — absent override,
 * the computed width under 640px is identical to today.
 *
 * Pure functions, no React, no DOM: the resolution is the thing worth pinning
 * with a test, and a test should not have to render a tree to reach it.
 */

import type { BuilderCarouselNode } from "./types";

/** Slides shown when the author never picked a number. Matches the CSS default. */
export const CAROUSEL_SLIDES_PER_VIEW_DEFAULT = 2;

/** The choices the schema accepts. Kept here so the inspector cannot drift. */
export const CAROUSEL_SLIDES_PER_VIEW_CHOICES = [1, 2, 3, 4] as const;

export type CarouselSlidesPerView =
  (typeof CAROUSEL_SLIDES_PER_VIEW_CHOICES)[number];

/** The override tiers a carousel can carry. Base ("desktop") is not a bucket. */
export const CAROUSEL_RESPONSIVE_TIERS = ["tablet", "mobile"] as const;

export type CarouselResponsiveTier = (typeof CAROUSEL_RESPONSIVE_TIERS)[number];

type CarouselProps = BuilderCarouselNode["props"];

/**
 * The tablet count when the author set none.
 *
 * This is the pre-existing `Math.min(slidesPerView ?? 2, 2)` and it stays the
 * fallback rather than becoming "same as desktop": changing it would re-flow
 * every stored 3-up and 4-up rail on tablet, which is precisely the
 * back-compat break this feature is not allowed to make.
 */
export function defaultTabletSlidesPerView(base: number): number {
  return Math.min(base, 2);
}

/**
 * The count actually in effect on a tier, for the inspector's "what will I
 * see" readout. `null` tier means the desktop base.
 */
export function effectiveSlidesPerView(
  props: Pick<CarouselProps, "slidesPerView" | "responsive">,
  tier: CarouselResponsiveTier | null,
): number {
  const base = props.slidesPerView ?? CAROUSEL_SLIDES_PER_VIEW_DEFAULT;
  if (tier === null) return base;
  const explicit = props.responsive?.[tier]?.slidesPerView;
  if (typeof explicit === "number") return explicit;
  if (tier === "tablet") return defaultTabletSlidesPerView(base);
  // Mobile's shipped default is the 86% peek, i.e. "one and a bit". Reported
  // as 1 because that is the number of WHOLE slides the visitor sees, and the
  // readout must not claim a count the CSS does not produce.
  return CAROUSEL_MOBILE_DEFAULT_WHOLE_SLIDES;
}

/**
 * Whole slides visible under 640px with no override. The rule is
 * `flex-basis:86%` (one slide plus a peek at the next), so the honest whole
 * count is 1.
 */
export const CAROUSEL_MOBILE_DEFAULT_WHOLE_SLIDES = 1;

/** The literal the mobile CSS rule falls back to when no override is set. */
export const CAROUSEL_MOBILE_DEFAULT_SLIDE_WIDTH = "86%";

/** True when this tier carries an explicit override (drives the override dot). */
export function hasSlidesPerViewOverride(
  props: Pick<CarouselProps, "responsive">,
  tier: CarouselResponsiveTier,
): boolean {
  return typeof props.responsive?.[tier]?.slidesPerView === "number";
}

/**
 * Drop empty buckets so a reset does not leave `{ tablet: {} }` behind. An
 * empty object is not the same as an absent one for the byte-identical claim:
 * it survives the Zod parse and lands in the saved snapshot.
 */
export function cleanCarouselResponsive(
  responsive: CarouselProps["responsive"],
): CarouselProps["responsive"] {
  if (!responsive) return undefined;
  const out: NonNullable<CarouselProps["responsive"]> = {};
  for (const tier of CAROUSEL_RESPONSIVE_TIERS) {
    const bucket = responsive[tier];
    if (!bucket) continue;
    if (typeof bucket.slidesPerView !== "number") continue;
    out[tier] = { slidesPerView: bucket.slidesPerView };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build the patch that sets (or clears, with `undefined`) one tier's count.
 * Returns the WHOLE `responsive` value, because a patch merges at the top
 * level and a partial bucket would clobber the other tier.
 */
export function slidesPerViewPatch(
  props: Pick<CarouselProps, "responsive">,
  tier: CarouselResponsiveTier,
  next: CarouselSlidesPerView | undefined,
): { responsive: CarouselProps["responsive"] } {
  const merged: NonNullable<CarouselProps["responsive"]> = {
    ...(props.responsive ?? {}),
    [tier]: { ...(props.responsive?.[tier] ?? {}), slidesPerView: next },
  };
  return { responsive: cleanCarouselResponsive(merged) };
}

/**
 * Map the inspector's active editing tier onto a carousel bucket.
 *
 * Only `tablet` and `mobile` are render-backed: those are the two media
 * queries the rail's CSS has. Any other editing tier the breakpoint registry
 * offers (wide, compact, a tenant's custom one) returns `null` and edits the
 * BASE, because storing a bucket no stylesheet reads would give the operator a
 * control that appears to work and changes nothing.
 */
export function carouselResponsiveTier(
  device: string,
): CarouselResponsiveTier | null {
  return device === "tablet" || device === "mobile" ? device : null;
}

/**
 * Apply a slide count from a `<Segmented>`-style string value to the right
 * slot for `tier`. Lives here, not in the panel, so the base-vs-bucket
 * decision has exactly one implementation across the two inspectors that
 * offer this field.
 */
export function setCarouselSlidesPerView(
  props: Pick<CarouselProps, "responsive">,
  tier: CarouselResponsiveTier | null,
  next: string,
  onPatch: (patch: Record<string, unknown>) => void,
): void {
  const count = Number.parseInt(next, 10);
  if (!CAROUSEL_SLIDES_PER_VIEW_CHOICES.includes(count as CarouselSlidesPerView)) {
    return;
  }
  const value = count as CarouselSlidesPerView;
  onPatch(
    tier === null
      ? { slidesPerView: value }
      : slidesPerViewPatch(props, tier, value),
  );
}

/**
 * The three CSS custom properties the rail renders with.
 *
 * `mobileSlideWidth` is `undefined` when no mobile override is set, and the
 * renderer's `builderNodeStyleVars` drops undefined entries — so the emitted
 * style attribute is character-for-character what it was before this feature
 * for every carousel that has no `responsive` bucket.
 */
export function carouselSlideVars(
  props: Pick<CarouselProps, "slidesPerView" | "responsive">,
): {
  slideWidth: string;
  tabletSlides: number;
  mobileSlideWidth: string | undefined;
} {
  const base = props.slidesPerView ?? CAROUSEL_SLIDES_PER_VIEW_DEFAULT;
  const tablet =
    props.responsive?.tablet?.slidesPerView ?? defaultTabletSlidesPerView(base);
  const mobile = props.responsive?.mobile?.slidesPerView;
  return {
    slideWidth: `${100 / base}%`,
    tabletSlides: tablet,
    mobileSlideWidth: typeof mobile === "number" ? `${100 / mobile}%` : undefined,
  };
}
