/**
 * Device-frame blank timing — pure helpers for C1 (TUL-79 #12).
 *
 * Before this fix the tablet/phone iframe host showed a white frame with no
 * skeleton until `editor:ready` (~5 s Live QA). After, the frame-shaped
 * skeleton paints on the same React commit as the device switch, so
 * blank-to-skeleton is 0 ms even while the iframe still loads.
 *
 * These helpers let unit tests assert the contract without spinning up Next.
 */

export type DeviceFrameBlankSample = {
  /** performance.now() (or Date.now()) when the operator picked tablet/phone. */
  deviceSwitchAt: number;
  /** When the frame-matching skeleton first painted; null = never (pre-fix). */
  skeletonPaintAt: number | null;
  /** When the active iframe posted `editor:ready`; null = still loading. */
  iframeReadyAt: number | null;
};

/** Live QA baseline (TUL-79 #12 on a9277d1f7): blank frame, no skeleton. */
export const DEVICE_FRAME_BLANK_BEFORE_MS = 5000;

/**
 * Milliseconds of empty (no skeleton, no content) after the device switch.
 * Returns null when neither skeleton nor ready has fired yet.
 */
export function blankMsUntilFirstSignal(sample: DeviceFrameBlankSample): number | null {
  const first =
    sample.skeletonPaintAt != null && sample.iframeReadyAt != null
      ? Math.min(sample.skeletonPaintAt, sample.iframeReadyAt)
      : sample.skeletonPaintAt ?? sample.iframeReadyAt;
  if (first == null) return null;
  return Math.max(0, first - sample.deviceSwitchAt);
}

/** True when the skeleton paints on the same tick as the device switch (post-fix). */
export function skeletonIsImmediate(sample: DeviceFrameBlankSample): boolean {
  return (
    sample.skeletonPaintAt != null &&
    sample.skeletonPaintAt <= sample.deviceSwitchAt
  );
}

/**
 * Mark a tier ready when an `editor:ready` message's source matches that
 * tier's iframe contentWindow. Pure: returns a new Set.
 */
export function markTierReadyFromSource(
  ready: ReadonlySet<string>,
  tierByContentWindow: ReadonlyMap<object, string>,
  source: unknown,
): ReadonlySet<string> {
  if (source == null || (typeof source !== "object" && typeof source !== "function")) {
    return ready;
  }
  const tier = tierByContentWindow.get(source as object);
  if (!tier || ready.has(tier)) return ready;
  const next = new Set(ready);
  next.add(tier);
  return next;
}
