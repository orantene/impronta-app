/**
 * hide-impact.ts — D6 pure "where-used / impact preview" shape + message builder.
 *
 * Before HIDING or ARCHIVING a catalog component (or a Template-Manager template
 * row), the operator should see how much live surface area the change touches, so
 * the one-way switch is an informed decision rather than a surprise. D6 composes
 * TWO complementary read signals (both already shipped):
 *
 *   1. D1 LIVE-PAGE USAGE — `usageCountForItem` over the cross-tenant
 *      `ComponentUsageTally`: how many tenant trees (live + draft pages, saved
 *      sections, reusable components, Max-site snapshots) currently reference the
 *      component's node TYPE / curated section-embed key. This is the "used on N
 *      live pages" number — they keep their copy, but it leaves the gallery.
 *
 *   2. G5 TEMPLATE DEPENDENTS — `scanTemplatesForComponentDependents`: how many
 *      OTHER published *templates* embed the component (the gallery-side blast
 *      radius G5 already blocks/confirms on).
 *
 * The two counts answer different questions ("who renders it on a live page" vs
 * "which gallery template would brick"), so D6 surfaces BOTH rather than
 * duplicating G5. This module is the pure glue: it owns the shape and the
 * human-readable message ONLY — no I/O, no DB, no React. The server action
 * (`loadHideImpact`) loads the two signals and feeds them in; the confirm dialog
 * renders `message` + the raw counts.
 *
 * Pure: no I/O, no throwing. Unit-tested directly (`hide-impact.test.ts`).
 */

/** The action verb the confirm is gating, used to phrase the message. */
export type HideImpactAction = "hide" | "archive";

/**
 * The composed impact preview for a single component/template. Both counts are
 * non-negative integers; `loadBearing` is the convenience flag the UI keys off to
 * decide whether to show the heavier "this touches live surface area" framing
 * (`usageCount > 0 || dependentCount > 0`).
 */
export interface HideImpact {
  /** D1 live-page usage: tenant trees that reference this component TYPE. */
  usageCount: number;
  /** G5 template dependents: OTHER published templates that embed this component. */
  dependentCount: number;
  /** True when either signal is non-zero — the archive/hide is consequential. */
  loadBearing: boolean;
  /** Human-readable one-liner for the confirm dialog. */
  message: string;
}

/** Clamp to a non-negative integer (defends the pure builder against bad input). */
function nonNegInt(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** "1 live page" / "N live pages" (handles the singular cleanly). */
function pages(n: number): string {
  return n === 1 ? "1 live page" : `${n} live pages`;
}

/** "1 other template" / "N other templates". */
function templates(n: number): string {
  return n === 1 ? "1 other template" : `${n} other templates`;
}

/**
 * Build the where-used impact message from the two raw counts. PURE — this is the
 * unit-tested core (the server action computes the counts; the confirm renders
 * the string).
 *
 * Phrasing rules:
 *   - Unused on both axes → a reassuring "nothing references this" line; the
 *     archive/hide is safe.
 *   - Used on live pages → "used on N live pages; they keep their copy but it
 *     leaves the gallery" (the D6 acceptance copy — existing renders are NOT
 *     deleted, the component is just removed from the "+" gallery going forward).
 *   - Embedded in other templates → appended "; N other templates embed it" so
 *     the gallery-side blast radius (G5's concern) is visible alongside.
 */
export function buildHideImpactMessage(
  usageCountRaw: number,
  dependentCountRaw: number,
  action: HideImpactAction = "archive",
): string {
  const usageCount = nonNegInt(usageCountRaw);
  const dependentCount = nonNegInt(dependentCountRaw);
  const verb = action === "hide" ? "Hiding" : "Archiving";

  if (usageCount === 0 && dependentCount === 0) {
    return `${verb} this is safe — nothing currently references it. It will leave the gallery; no live page or template is affected.`;
  }

  const parts: string[] = [];
  if (usageCount > 0) {
    parts.push(
      `it is used on ${pages(usageCount)} — they keep their copy, but it leaves the gallery`,
    );
  }
  if (dependentCount > 0) {
    parts.push(`${templates(dependentCount)} embed it`);
  }

  // "Archiving this is a one-way switch: <usage clause>[; <dependent clause>]."
  return `${verb} this is a one-way switch: ${parts.join("; ")}.`;
}

/**
 * Compose the full {@link HideImpact} from the two raw counts. PURE. The server
 * action wraps this after loading the D1 usage tally + the G5 dependent scan.
 */
export function buildHideImpact(
  usageCountRaw: number,
  dependentCountRaw: number,
  action: HideImpactAction = "archive",
): HideImpact {
  const usageCount = nonNegInt(usageCountRaw);
  const dependentCount = nonNegInt(dependentCountRaw);
  return {
    usageCount,
    dependentCount,
    loadBearing: usageCount > 0 || dependentCount > 0,
    message: buildHideImpactMessage(usageCount, dependentCount, action),
  };
}
