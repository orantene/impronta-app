import type { CompositionSectionRef } from "@/lib/site-admin/edit-mode/composition-actions";

/**
 * Canonical per-slot ordering for composition saves and navigator truth.
 * Sorts by `sortOrder`, re-denses to `0..n-1`, breaks ties by `sectionId`.
 */
export function normalizeCompositionSlots(
  slots: Record<string, CompositionSectionRef[]>,
): Record<string, CompositionSectionRef[]> {
  const out: Record<string, CompositionSectionRef[]> = {};
  for (const [slotKey, rows] of Object.entries(slots)) {
    const sorted = [...rows].sort((a, b) => {
      const d = a.sortOrder - b.sortOrder;
      if (d !== 0) return d;
      return a.sectionId.localeCompare(b.sectionId);
    });
    out[slotKey] = sorted.map((row, index) => ({
      ...row,
      sortOrder: index,
    }));
  }
  return out;
}
