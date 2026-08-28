/**
 * responsive-canvas-style.ts — WHERE A CANVAS DRAG LANDS.
 *
 * The Style panel already answers this question for its own controls
 * (`inspectors/style-panel/viewport-style-patch.ts`). The CANVAS direct
 * manipulation handles did not: resize, the devtools box model, rotate and the
 * move grip were all gated `device === "desktop"` in `selection-layer.tsx`, so
 * on the phone / tablet canvas the operator could see the block but not touch
 * it. The keyboard nudge was the single exception, and it proved the plumbing:
 * `kit/nudge.ts`'s `buildNudgeTranslateStyle` writes `style.responsive[tier]`
 * for one key and prunes the bucket back out when it empties.
 *
 * This module is that same write, generalised to an arbitrary patch, so every
 * canvas handle can share ONE answer to "base style or breakpoint bucket?".
 *
 * Three rules it exists to keep, each of which is invisible at the call site:
 *
 *  1. A drag on the phone canvas writes ONLY the phone value. The base
 *     (desktop) style is carried through by reference and never rewritten.
 *  2. A drag on desktop writes ONLY the base style. An existing phone/tablet
 *     bucket is carried through untouched, so a later desktop edit can never
 *     silently discard mobile-specific work.
 *  3. A key the renderer has no breakpoint lane for (see
 *     `RESPONSIVE_PLUMBED_KEYS`) routes to the BASE style even on a phone
 *     canvas. Written into the bucket it would validate, save, read back — and
 *     render nothing. A control that reports success and changes nothing is
 *     the worst failure mode in an editor, so it is ruled out here rather than
 *     discovered on the live page.
 *
 * Pure and DOM-free on purpose: `selection-layer.tsx` is under a line-count
 * ratchet with no headroom, and the invariants above deserve a test that does
 * not mount a 7,800-line component.
 */

import { isResponsivePlumbedStyleKey } from "@/lib/site-admin/builder-node/responsive-style-keys";

import type { EditDevice } from "./edit-context-types";

/**
 * `null` = the base (desktop) style. `"tablet"` / `"mobile"` = that responsive
 * override bucket. Deliberately the same shape as `MultiSelectionBucket` so a
 * bucket resolved here can be handed straight to the multi-selection helpers.
 */
export type ResponsiveStyleBucket = "tablet" | "mobile" | null;

/**
 * Which bucket a canvas edit taken at `device` writes into.
 *
 * Only `"tablet"` and `"mobile"` are render-backed override tiers. The
 * Advanced-only `"wide"` / `"compact"` canvas-preview tiers have no `@media`
 * bucket in the renderer yet, so an edit taken while previewing them falls
 * back to the base style rather than writing `style.responsive.wide`, which
 * nothing reads. Identical policy to `kit/nudge.ts`'s `resolveNudgeBucket`,
 * restated here so the canvas handles do not have to import the nudge module
 * to ask a question that is not about nudging.
 */
export function resolveCanvasStyleBucket(
  device: EditDevice,
): ResponsiveStyleBucket {
  if (device === "tablet") return "tablet";
  if (device === "mobile") return "mobile";
  return null;
}

/**
 * A canvas patch. `undefined` DELETES the key (back to inheriting), matching
 * the `delete nextStyle[key]` convention every existing canvas commit uses.
 */
export type CanvasStylePatch = Record<string, string | number | undefined>;

/**
 * Split a patch by whether the renderer has a breakpoint lane for each key.
 * Mirrors `splitPatchByResponsiveLane` in the Style panel; the canvas needs
 * its own copy because its patches are loose `Record`s, not typed style values.
 */
export function splitCanvasPatchByResponsiveLane(patch: CanvasStylePatch): {
  scoped: CanvasStylePatch;
  desktopOnly: CanvasStylePatch;
} {
  const scoped: CanvasStylePatch = {};
  const desktopOnly: CanvasStylePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (isResponsivePlumbedStyleKey(key)) scoped[key] = value;
    else desktopOnly[key] = value;
  }
  return { scoped, desktopOnly };
}

function applyInto(
  target: Record<string, unknown>,
  patch: CanvasStylePatch,
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete target[key];
    else target[key] = value;
  }
}

/**
 * The next `props.style` after applying `patch` at `bucket`.
 *
 * `bucket === null` writes the base style directly. Otherwise the plumbed keys
 * go into `style.responsive[bucket]` and the un-plumbed ones fall back to the
 * base style (rule 3 above). Empty buckets — and an empty `responsive`
 * container — are pruned so an override reset back to inheriting leaves no
 * `responsive: { mobile: {} }` residue behind to confuse the next reader.
 *
 * Never mutates `style`.
 */
export function buildResponsiveCanvasStyle({
  style,
  bucket,
  patch,
}: {
  readonly style: Record<string, unknown> | undefined;
  readonly bucket: ResponsiveStyleBucket;
  readonly patch: CanvasStylePatch;
}): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(style ?? {}) };
  if (bucket == null) {
    applyInto(next, patch);
    return next;
  }

  const { scoped, desktopOnly } = splitCanvasPatchByResponsiveLane(patch);
  // Un-plumbed keys still have to land somewhere that renders: the base style.
  applyInto(next, desktopOnly);

  const responsive: Record<string, unknown> = {
    ...((next.responsive as Record<string, unknown> | undefined) ?? {}),
  };
  const tier: Record<string, unknown> = {
    ...((responsive[bucket] as Record<string, unknown> | undefined) ?? {}),
  };
  applyInto(tier, scoped);

  if (Object.keys(tier).length > 0) responsive[bucket] = tier;
  else delete responsive[bucket];

  if (Object.keys(responsive).length > 0) next.responsive = responsive;
  else delete next.responsive;
  return next;
}

/**
 * The value a canvas control should SHOW at `bucket`: the bucket's own value
 * when it has one, otherwise the inherited base value. `undefined` when
 * neither is set.
 */
export function readCanvasStyleValue(
  style: Record<string, unknown> | undefined,
  bucket: ResponsiveStyleBucket,
  key: string,
): unknown {
  if (bucket != null) {
    const tier = (
      style?.responsive as Record<string, Record<string, unknown>> | undefined
    )?.[bucket];
    if (tier && key in tier) return tier[key];
  }
  return style?.[key];
}

/**
 * Which style keys carry a `bucket`-specific value — i.e. what this breakpoint
 * has stopped inheriting from desktop.
 *
 * `visibility` is EXCLUDED: it is the chip's existing "Hide on this device"
 * switch, which has its own affordance and its own undo. Counting it here
 * would make the override badge light up for every hidden block and turn the
 * badge into noise on exactly the pages that need it most.
 *
 * Sorted so the count and the tooltip are stable across renders.
 */
export const RESPONSIVE_BADGE_EXCLUDED_KEYS: ReadonlySet<string> = new Set([
  "visibility",
]);

export function responsiveOverrideKeys(
  style: Record<string, unknown> | undefined,
  bucket: ResponsiveStyleBucket,
): string[] {
  if (bucket == null) return [];
  const tier = (
    style?.responsive as Record<string, Record<string, unknown>> | undefined
  )?.[bucket];
  if (!tier) return [];
  return Object.keys(tier)
    .filter(
      (key) =>
        !RESPONSIVE_BADGE_EXCLUDED_KEYS.has(key) && tier[key] !== undefined,
    )
    .sort();
}

/**
 * Clear this breakpoint's overrides — back to INHERITING from desktop, not to
 * a hardcoded default. Dropping the keys is what makes that true: the renderer
 * emits no `@media` value for the tier, so the base style applies again with
 * whatever the operator has since set there.
 *
 * `keys` omitted clears every override on the tier (minus the excluded set,
 * so a "reset overrides" never silently un-hides a block the operator hid).
 * Returns `style` unchanged (by reference) when there is nothing to clear, so
 * a no-op reset does not push a pointless undo entry.
 */
export function clearResponsiveOverrides({
  style,
  bucket,
  keys,
}: {
  readonly style: Record<string, unknown> | undefined;
  readonly bucket: ResponsiveStyleBucket;
  readonly keys?: readonly string[];
}): Record<string, unknown> | undefined {
  if (bucket == null) return style;
  const clearing = keys ?? responsiveOverrideKeys(style, bucket);
  if (clearing.length === 0) return style;
  return buildResponsiveCanvasStyle({
    style,
    bucket,
    patch: Object.fromEntries(clearing.map((key) => [key, undefined])),
  });
}

/**
 * Human labels for the override badge. English text keys, so the editor's
 * `t()` (English-text-keyed `ES_TEXT`) can translate them without a new
 * semantic-key plumbing pass.
 */
export const RESPONSIVE_BUCKET_LABEL: Record<"tablet" | "mobile", string> = {
  tablet: "Tablet",
  mobile: "Phone",
};
