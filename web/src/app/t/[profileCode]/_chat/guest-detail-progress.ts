/**
 * guest-detail-progress.ts — DOCK v2. Pure, dependency-free detail-completeness
 * math for the "Add details" affordance.
 *
 * The old always-visible 6-chip row (Date · Location · Budget · Headcount · Type
 * · Brief) was the "too overwhelming" part of the panel. DOCK v2 folds those
 * fields behind ONE slim "Add details" button that shows a quiet progress hint
 * (e.g. "2/6"). This module answers "which of the six core details are set, and
 * how many" from the SAME sources the chip row read (the live intent + the
 * per-kind captured values), so the button hint and the sheet's per-row check
 * marks never disagree.
 *
 * PURE: no DOM, no i18n, no server code — unit-testable with node:test.
 */

import type { GuestChipKind, GuestChipValue } from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

/** The six core detail kinds the progress hint counts (Contact + Talent excluded
 *  — they are their own sections, not part of the "event details" tally). */
export const CORE_DETAIL_KINDS: GuestChipKind[] = [
  "date",
  "location",
  "budget",
  "headcount",
  "event_type",
];

/**
 * Is a single detail kind set? Mirrors the filled-state logic the chip row used
 * (captured value first, then the live intent fallback), collapsed to a boolean.
 * Handles the 5 structured chip kinds plus the composite "brief".
 */
export function isDetailFilled(
  kind: GuestChipKind | "brief",
  intent: InquiryIntent | null,
  capturedValues: Partial<Record<GuestChipKind, GuestChipValue>>,
): boolean {
  switch (kind) {
    case "date": {
      const v = capturedValues.date;
      if (v?.eventDate) return true;
      if (v?.dateStatus === "flexible" || v?.dateStatus === "not_sure") return true;
      return Boolean(intent?.date?.event_date);
    }
    case "location": {
      const v = capturedValues.location;
      if (v?.locationStatus === "online") return true;
      if (v?.city?.trim()) return true;
      if (v?.locationStatus === "not_sure") return true;
      return Boolean(intent?.location?.city?.trim());
    }
    case "headcount": {
      const n = capturedValues.headcount?.headcount ?? intent?.talent?.count_needed ?? null;
      return n != null && n > 0;
    }
    case "event_type": {
      const v = capturedValues.event_type?.eventType?.trim();
      if (v) return true;
      const ai = intent?.source_context?.["ai_event_type"];
      return typeof ai === "string" && ai.trim().length > 0;
    }
    case "budget": {
      const v = capturedValues.budget;
      if (v?.budgetAmount != null && v.currency) return true;
      if (v?.budgetPreference && v.budgetPreference !== "not_sure") return true;
      return intent?.budget?.amount != null && (intent?.budget?.amount ?? 0) > 0;
    }
    case "brief":
      return Boolean(intent?.brief?.summary?.trim());
    default:
      return false;
  }
}

/** True when the contact section has any value (name or email). */
export function isContactFilled(intent: InquiryIntent | null): boolean {
  return Boolean(intent?.requester?.name?.trim() || intent?.requester?.email?.trim());
}

/** True when at least one talent is selected on the inquiry. */
export function isTalentFilled(intent: InquiryIntent | null): boolean {
  return (intent?.talent?.selected_ids?.length ?? 0) > 0;
}

export type DetailProgress = {
  /** How many of the 6 core details (5 chip kinds + brief) are set. */
  filled: number;
  /** The denominator (always 6). */
  total: number;
};

/**
 * Count the set core details out of six (the 5 structured kinds + brief). Drives
 * the "Add details N/6" hint. Contact + talent are tracked separately and never
 * counted here.
 */
export function countCoreDetails(
  intent: InquiryIntent | null,
  capturedValues: Partial<Record<GuestChipKind, GuestChipValue>>,
): DetailProgress {
  const kinds: Array<GuestChipKind | "brief"> = [...CORE_DETAIL_KINDS, "brief"];
  let filled = 0;
  for (const kind of kinds) {
    if (isDetailFilled(kind, intent, capturedValues)) filled += 1;
  }
  return { filled, total: kinds.length };
}
