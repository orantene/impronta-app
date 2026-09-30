/**
 * Read-side predicates for the free-website unlock checklist.
 *
 * Each one must accept EVERY place the talent UI writes the fact, because the
 * checklist once read only legacy columns while the profile drawer wrote
 * elsewhere (fresh talent TAL-93901, 2026-09-30):
 *   - intro: drawer About writes the `bios` catalog field value
 *     ([{ locale, text }]), not talent_profiles.short_bio / bio_i18n.
 *   - where: drawer Location writes talent_profiles.home_city_text (+ place id);
 *     talent_service_areas stays empty until the canonical picker runs.
 *   - when: drawer Availability writes talent_profiles.availability_data
 *     (recurring pattern / day cells); Services writes talent_booking_hours.
 * Saved work counts. Nothing here requires a publish step.
 */

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Any saved intro in any locale, from any of the three stores. */
export function hasIntroFromSources(input: {
  shortBio?: string | null;
  bioI18n?: Record<string, string | null> | null;
  /** `bios` catalog value: [{ locale, text }]. */
  biosFieldValue?: unknown;
}): boolean {
  if (nonEmpty(input.shortBio)) return true;
  if (input.bioI18n && Object.values(input.bioI18n).some(nonEmpty)) return true;
  if (Array.isArray(input.biosFieldValue)) {
    return input.biosFieldValue.some(
      (row) => row != null && typeof row === "object" && nonEmpty((row as { text?: unknown }).text),
    );
  }
  return false;
}

/** Display city for "Where you work": service-area home base first, then the drawer's text. */
export function homeCityFromSources(input: {
  serviceAreaHomeCity?: string | null;
  homeCityText?: string | null;
}): string | null {
  if (nonEmpty(input.serviceAreaHomeCity)) return input.serviceAreaHomeCity!.trim();
  if (nonEmpty(input.homeCityText)) return input.homeCityText!.trim();
  return null;
}

/**
 * True when the drawer's saved availability says something real: a recurring
 * pattern other than "none", or at least one day cell. An empty default
 * (`{ cells: [], recurring: { kind: "none" } }`) is not availability.
 */
export function hasAvailabilityPattern(availabilityData: unknown): boolean {
  if (!availabilityData || typeof availabilityData !== "object") return false;
  const data = availabilityData as { cells?: unknown; recurring?: unknown };
  const recurring = data.recurring as { kind?: unknown } | null | undefined;
  if (recurring && typeof recurring.kind === "string" && recurring.kind !== "none") return true;
  return Array.isArray(data.cells) && data.cells.length > 0;
}

/**
 * "When you are available" is done when EITHER writer has real data: the
 * drawer pattern or bookable hours from Services. Unknown only while hours
 * are still loading and the pattern says nothing.
 */
export function recurringStatusForDow(
  recurring: { kind?: string; busyDays?: number[] } | null | undefined,
  dow: number,
): "busy" | "blocked" | null {
  // What a recurring pattern implies for one weekday (0 = Sunday), so the
  // drawer's calendar preview shows the pattern just picked. Explicit day
  // cells still win; null = the pattern says nothing about this day.
  const weekend = dow === 0 || dow === 6;
  switch (recurring?.kind) {
    case "weekdays-only":
      return weekend ? "blocked" : null;
    case "weekends-only":
      return weekend ? null : "blocked";
    case "weekly-busy":
      return recurring.busyDays?.includes(dow) ? "busy" : null;
    default:
      return null;
  }
}

/**
 * F84: "Things clients can book or ask about" counts every service she keeps
 * (not archived), whatever its booking mode. Request, instant and quote all
 * let a client book or ask; the free-plan ceiling limits instant only and
 * must never make her services count as unavailable.
 */
export function countBookableOfferings(
  items: ReadonlyArray<{ status?: string | null }> | null | undefined,
): number | null {
  if (!items) return null;
  return items.filter((item) => item.status !== "archived").length;
}

export function combineAvailability(input: {
  pattern: boolean | null;
  hours: boolean | null;
}): boolean | null {
  if (input.pattern === true || input.hours === true) return true;
  if (input.hours == null) return null;
  return false;
}
