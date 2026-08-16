/**
 * Draft↔live delta helpers for the Card Design studio's Publish cluster.
 *
 * Publish promotes the ENTIRE design draft — not just the card slice this page
 * edits — so the studio must know two things:
 *
 *   - `computeDesignDirty`: has anything THIS PAGE touches diverged from live?
 *     (union of keys, so template tokens like reviews/standing count too)
 *   - `computeDriftCount`: how many draft↔live differences exist OUTSIDE the
 *     page's own tokens? Those ship on Publish as well; surfacing the count is
 *     the guardrail against the 2026-08-15 incident where a one-swatch publish
 *     silently carried a stale site-wide theme draft live.
 */

// Registry defaults for the reviews-on-cards template tokens. Module scope so
// readTemplateToken's dependency array can stay honest (only draftTokens varies).
export const STANDING_DEFAULTS: Record<string, string> = {
  "directory.card.show-standing": "compact",
  "directory.card.standing-style": "both",
  "profile.reviews-visibility": "visible",
};

import { LEGACY_THEME_PASSTHROUGH_KEYS } from "@/lib/site-admin/tokens/legacy-passthrough";

/** Union-key inequality between two token maps ("" and absent are equal). */
export function computeDesignDirty(
  draft: Record<string, string>,
  live: Record<string, string>,
): boolean {
  const keys = new Set([...Object.keys(draft), ...Object.keys(live)]);
  for (const k of keys) {
    if ((draft[k] ?? "") !== (live[k] ?? "")) return true;
  }
  return false;
}

/**
 * Count of draft↔live differences whose key is NOT owned by this page.
 * Legacy passthrough keys (logo_url / favicon_url / watermark_preset) are
 * excluded: publish PRESERVES the live row's values for them (see
 * `publishDesign`), so a live↔draft difference there never ships and must
 * not light the drift warning.
 */
export function computeDriftCount(
  fullDraft: Record<string, string>,
  fullLive: Record<string, string>,
  pageOwnedKeys: ReadonlySet<string>,
): number {
  const keys = new Set([...Object.keys(fullDraft), ...Object.keys(fullLive)]);
  let n = 0;
  for (const k of keys) {
    if (pageOwnedKeys.has(k) || LEGACY_THEME_PASSTHROUGH_KEYS.has(k)) continue;
    if ((fullDraft[k] ?? "") !== (fullLive[k] ?? "")) n += 1;
  }
  return n;
}

/**
 * Live-map re-seed after a SCOPED publish.
 *
 * Only the page's own tokens went live, so only those may be copied from the
 * draft onto the local "live" mirror. Copying the whole draft would zero
 * `driftCount` and tell the operator that another surface's pending changes
 * had shipped — they have not.
 */
export function mergeScopedLive(
  prevLive: Record<string, string>,
  fullDraft: Record<string, string>,
  scopeKeys: ReadonlySet<string>,
): Record<string, string> {
  const next = { ...prevLive };
  for (const key of scopeKeys) {
    if (key in fullDraft) next[key] = fullDraft[key];
  }
  return next;
}
