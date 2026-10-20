/**
 * TUL-1337 — pure rules for what Duplicate carries beyond options and extras,
 * and the copy's name. No server imports, so they are testable on their own.
 */
import type { OfferingPricePhaseRow } from "@/lib/server-actions/catalog-engine-reads";

/** "Latte" + "copy" -> "Latte (copy)". The suffix is the workspace language's word. */
export function copyTitle(title: string, suffix: string): string {
  return `${title} (${suffix})`;
}

/**
 * Phases the copy should get: live and upcoming ones only (a phase that already ended is history,
 * not a price to repeat). A phase tied to an option follows it to the copy's option (by position);
 * one whose option is gone is dropped rather than turned into a price for the whole item.
 */
export function remapPhases(
  phases: readonly OfferingPricePhaseRow[],
  variantMap: ReadonlyMap<string, string>,
  nowIso: string,
): OfferingPricePhaseRow[] {
  const now = Date.parse(nowIso);
  const out: OfferingPricePhaseRow[] = [];
  for (const p of phases) {
    if (p.endsAt && Date.parse(p.endsAt) <= now) continue;
    if (p.variantId == null) {
      out.push({ ...p, variantId: null });
      continue;
    }
    const mapped = variantMap.get(p.variantId);
    if (mapped) out.push({ ...p, variantId: mapped });
  }
  return out;
}
