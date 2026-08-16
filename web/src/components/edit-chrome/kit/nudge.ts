/**
 * kit/nudge.ts — pure helpers behind the canvas keyboard nudge (Alt+arrow
 * moves the selected block/set by translate; Alt+Shift+arrow = 10px).
 *
 * Extracted out of `selection-layer.tsx` (a size-ratchet file with zero
 * headroom) so the breakpoint-bucket resolution and key-repeat acceleration
 * curve are unit-testable without touching the DOM or React.
 */
import type { EditDevice } from "../edit-context-types";
import type { MultiSelectionBucket } from "@/lib/site-admin/builder-node/multi-selection-style";

/**
 * Which responsive override bucket a nudge at the active canvas-preview
 * `device` should write into. Only `"tablet"` and `"mobile"` are render-backed
 * override tiers (see `breakpoint-registry.ts`'s `editable` flag — the
 * renderer emits their `@media` buckets; the Advanced-only `"wide"`/`"compact"`
 * canvas-preview tiers do not have one yet). `"desktop"` is the base tier.
 *
 * Nudging while previewing `"wide"`/`"compact"` therefore intentionally falls
 * back to the base (desktop) bucket rather than writing into
 * `style.responsive.wide`/`.compact`, which nothing in the renderer reads —
 * that would look like it worked and silently do nothing.
 */
export function resolveNudgeBucket(device: EditDevice): MultiSelectionBucket {
  if (device === "tablet") return "tablet";
  if (device === "mobile") return "mobile";
  return null;
}

export interface NudgeTranslateStyleInput {
  /** The node's current `props.style` (or `undefined`). Not mutated. */
  readonly style: Record<string, unknown> | undefined;
  /** `null` writes the base style; `"tablet"`/`"mobile"` writes that override bucket. */
  readonly bucket: MultiSelectionBucket;
  /** Absolute translate target, in px (already clamped by the caller). */
  readonly x: number;
  readonly y: number;
}

/**
 * Compute the next `props.style` object after writing an absolute nudge
 * translate value into the base style or a responsive override bucket.
 * Mirrors the base/bucket write convention used elsewhere in the builder
 * (`mergeStylePatchIntoTree` in `multi-node-layout.ts`, `onHideOnDevice` in
 * `selection-layer.tsx`): the base bucket writes `style.translate` directly;
 * a responsive bucket writes `style.responsive[bucket].translate`, pruning the
 * bucket and then the `responsive` container back out once empty so an
 * untouched block never grows a `style: {}` / `responsive: {}` residue.
 *
 * `x === 0 && y === 0` drops the key entirely (back to the natural/inherited
 * position) — the same 0,0 convention `commitSelectedNodeTranslate` already
 * uses for the base bucket.
 */
export function buildNudgeTranslateStyle({
  style,
  bucket,
  x,
  y,
}: NudgeTranslateStyleInput): Record<string, unknown> {
  const nextStyle: Record<string, unknown> = { ...(style ?? {}) };
  const rx = Math.round(x);
  const ry = Math.round(y);
  const translateValue = rx === 0 && ry === 0 ? undefined : `${rx}px ${ry}px`;

  if (bucket == null) {
    if (translateValue === undefined) delete nextStyle.translate;
    else nextStyle.translate = translateValue;
    return nextStyle;
  }

  const responsive: Record<string, unknown> = {
    ...((nextStyle.responsive as Record<string, unknown> | undefined) ?? {}),
  };
  const tier: Record<string, unknown> = {
    ...((responsive[bucket] as Record<string, unknown> | undefined) ?? {}),
  };
  if (translateValue === undefined) delete tier.translate;
  else tier.translate = translateValue;

  if (Object.keys(tier).length > 0) {
    responsive[bucket] = tier;
  } else {
    delete responsive[bucket];
  }
  if (Object.keys(responsive).length > 0) {
    nextStyle.responsive = responsive;
  } else {
    delete nextStyle.responsive;
  }
  return nextStyle;
}

/**
 * Key-repeat acceleration — after this many consecutive held repeats the
 * nudge step multiplies by {@link NUDGE_ACCELERATION_MULTIPLIER}, so a long
 * hold covers ground fast without costing a quick tap its 1px precision.
 */
export const NUDGE_ACCELERATION_THRESHOLD = 10;
export const NUDGE_ACCELERATION_MULTIPLIER = 4;

/**
 * Resolve the effective per-press step given the base step (1px, or 10px with
 * Shift) and how many consecutive OS key-repeat events have fired for the
 * current hold (0 for the initial, non-repeat press — see
 * `KeyboardEvent.repeat`). Pure so the acceleration curve is testable without
 * driving real keyboard timing.
 */
export function nudgeStepForRepeatCount(
  baseStep: number,
  repeatCount: number,
): number {
  return repeatCount >= NUDGE_ACCELERATION_THRESHOLD
    ? baseStep * NUDGE_ACCELERATION_MULTIPLIER
    : baseStep;
}
