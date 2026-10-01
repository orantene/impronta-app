/**
 * Per-section pixel-diff thresholds: the maximum mismatch ratio (0..1) a section may
 * have against the mockup before it becomes a delta. Enforced on the reference demo
 * only (Alba, whose content is exact); other demos get structure checks.
 *
 * Kept beside the section map (not in it) so the map can move to a per-design JSON
 * without dragging the thresholds along. A section may override its number with
 * `pixelThreshold` in its map entry.
 *
 * Why not zero: text anti-aliasing and photo re-encoding never match to the pixel.
 * Photo-heavy sections get more room than text sections. Tighten a number only
 * together with the fix that earns it.
 */
export const PIXEL_THRESHOLDS = {
  header: 0.12,
  hero: 0.18,
  work: 0.22,
  menu: 0.18,
  reviews: 0.16,
  about: 0.18,
  faq: 0.12,
  location: 0.16,
  footer: 0.12,
  socket: 0.1,
};

export const DEFAULT_PIXEL_THRESHOLD = 0.15;

/**
 * Threshold for a map section. Order: the section's `pixel.maxMismatch` in parity-map.json,
 * the legacy `pixelThreshold`, the per-key table above, the default.
 */
export const pixelThresholdFor = (key, sec) => {
  const o = sec && typeof sec === "object" ? sec : { pixelThreshold: sec };
  if (typeof o.pixel?.maxMismatch === "number") return o.pixel.maxMismatch;
  if (typeof o.pixelThreshold === "number") return o.pixelThreshold;
  return PIXEL_THRESHOLDS[key] ?? DEFAULT_PIXEL_THRESHOLD;
};
