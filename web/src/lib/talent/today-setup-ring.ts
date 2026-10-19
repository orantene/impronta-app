/**
 * The Today "Finish setting up your profile" ring (TUL-1276).
 *
 * ONE value: the same website-eligibility summary the Profile quality card
 * reads (`summarizeEligibility`). It never falls back to the agency checklist
 * score: that second model painted 45% while the eligibility reads were still
 * in flight (the language switch reloads the page, so a cold load looked like
 * "EN shows 45%, ES shows 70%"). While the facts load the ring is neutral.
 * No locale input: the same facts give the same percent in every language.
 */
import type { WebsiteSlice } from "./website-eligibility";
import { summarizeEligibility } from "./profile-editor-sections";

export function todaySetupRingPercent(eligibility: {
  percent: number | null;
  slices: readonly WebsiteSlice[];
}): number | null {
  return summarizeEligibility(eligibility).percent;
}

/** "70%", or a neutral dot while the checks load (same glyph as Profile). */
export function todaySetupRingLabel(percent: number | null): string {
  return percent == null ? "·" : `${percent}%`;
}
