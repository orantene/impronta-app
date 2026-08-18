/**
 * Overlay opacity is stored in two conventions:
 *   - presentation / videoOverlay / talent_type_grid: float 0–1
 *   - hero / cta_banner / builder backgroundMedia: int 0–100
 *
 * CSS `opacity` and `data-section-overlay-opacity` consume 0–1. Copying a
 * 0–100 value into a 0–1 field (or the reverse) without converting either
 * no-ops the overlay (0.45 → schema fail / 0%) or paints it solid (45 → 1).
 */
export function overlayOpacityToUnitInterval(
  value: number | undefined | null,
): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value > 1) return Math.min(1, Math.max(0, value / 100));
  return Math.min(1, Math.max(0, value));
}
