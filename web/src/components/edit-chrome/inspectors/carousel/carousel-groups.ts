/**
 * carousel-groups.ts — the slider inspector's group recipe.
 *
 * Same artefact, same reasoning as `style-panel/group-recipes.ts`: which
 * groups a selection gets is a DECLARATION, checkable in one screen and
 * reportable in a PR body, not something you learn by counting rendered
 * children. See that module's header for why.
 *
 * WHAT IT REPLACES
 * ────────────────
 * The carousel's Content panel used to render a flat run of
 * `BuilderNodeSection`s — Slides, Slider, Size & motion, Autoplay, Overlay &
 * texture, Navigation, Content — six of them always expanded, in a ~300px
 * column, with the rail variant getting a "Size & motion" section it does not
 * use. That is the wall of fields D4 exists to remove.
 *
 * THE TWO RECIPES
 * ───────────────
 * One node, two genuinely different blocks, so two recipes:
 *
 *   rail  → Slides · Layout · Advanced
 *   hero  → Slides · Layout · Motion · Look & navigation · Advanced
 *
 * Four groups plus Advanced on the hero is one more than the Style panel's
 * "2-3 + Advanced", and that is deliberate rather than drift: a hero carousel
 * carries ~30 props across four unrelated concerns (how big it is, how it
 * moves, what is painted over it, what content sits on it). Folding "what is
 * painted over it" into "how it moves" would give a shorter list and a worse
 * one. The rail, which has four real props, gets three groups.
 *
 * SLIDES IS FIRST AND OPEN, ALWAYS
 * ────────────────────────────────
 * Every other group configures the slider; Slides is the one that edits its
 * CONTENTS, and reaching slide 3 was the owner's original complaint. It opens
 * on first sight for both variants.
 */

export type CarouselGroupId =
  | "slides"
  | "layout"
  | "motion"
  | "look"
  | "advanced";

export type CarouselVariant = "rail" | "hero";

/** Fixed render order. Advanced is always last. */
export const CAROUSEL_GROUP_ORDER: readonly CarouselGroupId[] = [
  "slides",
  "layout",
  "motion",
  "look",
  "advanced",
] as const;

/**
 * Plain-language titles. Spec words ("variant", "slidesPerView", "scrim") are
 * demoted to field hints; a group title names the job, not the schema.
 */
export const CAROUSEL_GROUP_TITLES: Record<CarouselGroupId, string> = {
  slides: "Slides",
  layout: "Layout",
  motion: "Motion",
  look: "Look and navigation",
  advanced: "Advanced",
};

const RAIL_GROUPS: readonly CarouselGroupId[] = [
  "slides",
  "layout",
  "advanced",
] as const;

const HERO_GROUPS: readonly CarouselGroupId[] = [
  "slides",
  "layout",
  "motion",
  "look",
  "advanced",
] as const;

export function carouselGroupsFor(
  variant: CarouselVariant,
): readonly CarouselGroupId[] {
  return variant === "hero" ? HERO_GROUPS : RAIL_GROUPS;
}

export function hasCarouselGroup(
  variant: CarouselVariant,
  group: CarouselGroupId,
): boolean {
  return carouselGroupsFor(variant).includes(group);
}

/** The group that opens on first sight. Never `advanced`. */
export function firstOpenCarouselGroup(): CarouselGroupId {
  return "slides";
}

/**
 * "Find a setting" terms per group. Includes the SPEC names the labels
 * demoted to hints, so an operator who knows the CSS/schema word still lands
 * on the plain-language control instead of concluding it was removed.
 */
export const CAROUSEL_GROUP_SEARCH_TERMS: Record<
  CarouselGroupId,
  readonly string[]
> = {
  slides: ["slides", "add slide", "reorder", "duplicate", "remove slide", "thumbnail"],
  layout: [
    "layout",
    "variant",
    "rail",
    "hero",
    "slides visible",
    "slides per view",
    "slidesPerView",
    "per view",
    "desktop",
    "tablet",
    "mobile",
    "responsive",
    "height",
    "heightMode",
    "min height",
    "minHeightPx",
    "arrows",
    "dots",
    "content placement",
    "contentAlign",
  ],
  motion: [
    "motion",
    "rotate",
    "autoplay",
    "autoplayMs",
    "interval",
    "speed",
    "loop",
    "pause on hover",
    "pauseOnHover",
    "transition",
    "crossfade",
    "slide",
    "ken burns",
    "kenBurns",
    "zoom",
  ],
  look: [
    "overlay",
    "scrim",
    "tone",
    "vignette",
    "opacity",
    "strength",
    "grain",
    "texture",
    "navigation",
    "dots",
    "arrows",
    "counter",
    "progress",
    "scroll cue",
    "controls",
  ],
  advanced: [
    "content mode",
    "contentMode",
    "shared content",
    "sharedContent",
    "eyebrow",
    "heading",
    "accent",
    "subtext",
    "buttons",
    "cta",
    "link",
  ],
};
