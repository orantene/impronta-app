/**
 * animation-presets — the ONE source of truth for the builder's entrance
 * animation vocabulary.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * An animation preset has to be wired at four layers to actually work:
 *   1. the zod enum in `registry.ts` (what a saved tree is allowed to contain),
 *   2. the TS type in `types.ts`,
 *   3. a `@keyframes bn-anim-<preset>` in `render.tsx`'s static sheet,
 *   4. a card in the inspector's Animation gallery.
 * Wiring three of the four is this repo's most-repeated defect: the panel
 * offers a preset that renders as nothing, or a keyframe ships that no operator
 * can reach. So the list lives HERE, once, and every layer derives from it:
 * `registry.ts` builds its `z.enum` from `BUILDER_ANIMATION_PRESETS`, the
 * gallery maps `BUILDER_ANIMATION_PRESET_SPECS`, and
 * `animation-preset-parity.static.test.ts` proves the keyframes in the rendered
 * sheet are exactly this set.
 *
 * DEPENDENCY-FREE ON PURPOSE. No imports, so `registry.ts` can pull it in
 * without touching the barrel-cycle guard, and the static tests can read it
 * without booting the renderer.
 *
 * TRAVEL DISTANCE. Directional presets read `--bn-anim-distance` (written from
 * the `animationDistance` style key) and fall back to the default recorded
 * here. `defaultDistance` is therefore not decoration: it is the literal value
 * baked into that preset's keyframe, and the parity test checks the pairing.
 */

/**
 * Every preset the renderer implements, in the order the gallery shows them.
 * `none` is first and is the "no animation" card, not a keyframe.
 *
 * ADDITIVE ONLY. `rise` / `fall` / `slide-left` / `slide-right` predate the
 * Animation tab and are persisted in shipped page designs — they keep their
 * keys forever. `rise` and `fall` ARE the fade-up / fade-down motions, so the
 * gallery labels them that way rather than shipping a duplicate pair of cards
 * that render identically.
 */
export const BUILDER_ANIMATION_PRESETS = [
  "none",
  "fade-in",
  "rise",
  "fall",
  "fade-left",
  "fade-right",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "bounce-in",
  "blur-in",
  "flip-in",
] as const;

export type BuilderAnimationPreset = (typeof BUILDER_ANIMATION_PRESETS)[number];

/** Presets that travel, and therefore honour the Distance control. */
export type BuilderAnimationAxis = "none" | "x" | "y";

export interface BuilderAnimationPresetSpec {
  value: BuilderAnimationPreset;
  /** Operator-facing card label. Plain language, no CSS jargon. */
  label: string;
  /** One line under the label, and the card's `title`. */
  description: string;
  /** Which way it travels. `"none"` hides the Distance control. */
  axis: BuilderAnimationAxis;
  /**
   * The distance baked into this preset's keyframe as the `--bn-anim-distance`
   * fallback. `null` for presets that do not travel.
   */
  defaultDistance: string | null;
}

export const BUILDER_ANIMATION_PRESET_SPECS: ReadonlyArray<BuilderAnimationPresetSpec> = [
  {
    value: "none",
    label: "None",
    description: "No entrance motion",
    axis: "none",
    defaultDistance: null,
  },
  {
    value: "fade-in",
    label: "Fade in",
    description: "Fades up from invisible, staying put",
    axis: "none",
    defaultDistance: null,
  },
  {
    value: "rise",
    label: "Fade up",
    description: "Drifts up into place while it fades in",
    axis: "y",
    defaultDistance: "24px",
  },
  {
    value: "fall",
    label: "Fade down",
    description: "Drops into place while it fades in",
    axis: "y",
    defaultDistance: "24px",
  },
  {
    value: "fade-left",
    label: "Fade left",
    description: "Drifts in from the right while it fades in",
    axis: "x",
    defaultDistance: "24px",
  },
  {
    value: "fade-right",
    label: "Fade right",
    description: "Drifts in from the left while it fades in",
    axis: "x",
    defaultDistance: "24px",
  },
  {
    value: "slide-up",
    label: "Slide up",
    description: "Travels up from further away",
    axis: "y",
    defaultDistance: "40px",
  },
  {
    value: "slide-down",
    label: "Slide down",
    description: "Travels down from further away",
    axis: "y",
    defaultDistance: "40px",
  },
  {
    value: "slide-left",
    label: "Slide left",
    description: "Travels in from the right edge",
    axis: "x",
    defaultDistance: "40px",
  },
  {
    value: "slide-right",
    label: "Slide right",
    description: "Travels in from the left edge",
    axis: "x",
    defaultDistance: "40px",
  },
  {
    value: "zoom-in",
    label: "Zoom in",
    description: "Grows from slightly smaller",
    axis: "none",
    defaultDistance: null,
  },
  {
    value: "zoom-out",
    label: "Zoom out",
    description: "Settles down from slightly larger",
    axis: "none",
    defaultDistance: null,
  },
  {
    value: "bounce-in",
    label: "Bounce in",
    description: "Overshoots a little, then settles",
    axis: "none",
    defaultDistance: null,
  },
  {
    value: "blur-in",
    label: "Blur in",
    description: "Sharpens into focus",
    axis: "none",
    defaultDistance: null,
  },
  {
    value: "flip-in",
    label: "Flip in",
    description: "Tips forward onto the page",
    axis: "none",
    defaultDistance: null,
  },
];

/** Spec lookup by preset key. */
export const BUILDER_ANIMATION_PRESET_BY_VALUE: Readonly<
  Record<BuilderAnimationPreset, BuilderAnimationPresetSpec>
> = Object.fromEntries(
  BUILDER_ANIMATION_PRESET_SPECS.map((spec) => [spec.value, spec]),
) as Record<BuilderAnimationPreset, BuilderAnimationPresetSpec>;

/** True when the preset travels, i.e. the Distance control does something. */
export function builderAnimationPresetTravels(
  preset: BuilderAnimationPreset | undefined,
): boolean {
  if (!preset) return false;
  return BUILDER_ANIMATION_PRESET_BY_VALUE[preset]?.axis !== "none";
}

/**
 * When an animation plays. `load` fires once as the page paints, `scroll` ties
 * it to the node passing through the viewport, `hover` plays it on cursor-over.
 */
export const BUILDER_ANIMATION_TRIGGERS = ["load", "scroll", "hover"] as const;
export type BuilderAnimationTrigger = (typeof BUILDER_ANIMATION_TRIGGERS)[number];

/**
 * How often a scroll-triggered animation runs. `once` reveals the node the
 * first time it scrolls in and leaves it alone (IntersectionObserver); `every`
 * ties playback position to scroll, so it replays on every pass
 * (`animation-timeline: view()`). Only meaningful for the `scroll` trigger.
 */
export const BUILDER_ANIMATION_REPEATS = ["once", "every"] as const;
export type BuilderAnimationRepeat = (typeof BUILDER_ANIMATION_REPEATS)[number];

/**
 * PREVIEW keyframes for the inspector's Animation gallery, at tile scale.
 *
 * They live beside the preset table rather than in the gallery component for
 * two reasons. One is the boundary: `lib/site-admin` may not import
 * `components/edit-chrome`, so a parity guard that lives with the renderer
 * cannot reach into the panel. The other is the checklist -- adding a preset
 * now means editing ONE file here (list, spec, preview keyframe) plus one
 * `@keyframes bn-anim-*` in render.tsx, and the parity guard fails if either
 * half is missed.
 *
 * These are deliberately NOT the published numbers: `bn-anim-*` travels 24px to
 * 40px, which is most of a 44px preview tile, so the previews are the same
 * MOTION scaled to the card.
 */
export const BUILDER_ANIMATION_PREVIEW_CSS = `
@keyframes bnag-fade-in{from{opacity:0}to{opacity:1}}
@keyframes bnag-rise{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
@keyframes bnag-fall{from{opacity:0;transform:translateY(-9px)}to{opacity:1;transform:translateY(0)}}
@keyframes bnag-fade-left{from{opacity:0;transform:translateX(9px)}to{opacity:1;transform:translateX(0)}}
@keyframes bnag-fade-right{from{opacity:0;transform:translateX(-9px)}to{opacity:1;transform:translateX(0)}}
@keyframes bnag-slide-up{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes bnag-slide-down{from{opacity:0;transform:translateY(-15px)}to{opacity:1;transform:translateY(0)}}
@keyframes bnag-slide-left{from{opacity:0;transform:translateX(15px)}to{opacity:1;transform:translateX(0)}}
@keyframes bnag-slide-right{from{opacity:0;transform:translateX(-15px)}to{opacity:1;transform:translateX(0)}}
@keyframes bnag-zoom-in{from{opacity:0;transform:scale(0.55)}to{opacity:1;transform:scale(1)}}
@keyframes bnag-zoom-out{from{opacity:0;transform:scale(1.45)}to{opacity:1;transform:scale(1)}}
@keyframes bnag-bounce-in{0%{opacity:0;transform:scale(0.6)}60%{opacity:1;transform:scale(1.18)}100%{opacity:1;transform:scale(1)}}
@keyframes bnag-blur-in{from{opacity:0;filter:blur(5px)}to{opacity:1;filter:blur(0)}}
@keyframes bnag-flip-in{from{opacity:0;transform:perspective(200px) rotateX(62deg)}to{opacity:1;transform:perspective(200px) rotateX(0)}}
`;

/** Speed presets behind the Slow / Normal / Fast chips, in CSS time. */
export const BUILDER_ANIMATION_SPEED_PRESETS: ReadonlyArray<{
  label: string;
  value: string;
}> = [
  { label: "Slow", value: "1.2s" },
  { label: "Normal", value: "0.6s" },
  { label: "Fast", value: "0.3s" },
];

/** The duration used when `animationDuration` is unset. Matches render.tsx. */
export const BUILDER_ANIMATION_DEFAULT_DURATION = "0.6s";
/** The delay used when `animationDelay` is unset. Matches render.tsx. */
export const BUILDER_ANIMATION_DEFAULT_DELAY = "0s";
