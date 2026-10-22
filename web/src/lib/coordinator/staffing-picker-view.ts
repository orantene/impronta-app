/**
 * staffing-picker-view.ts - the rows the Team tab's staffing picker shows (TUL-1373). Pure.
 * Ranks the roster with `rankCandidates` (unknown availability is never "free"), then marks who is
 * already on the job or already held so the screen can disable them.
 */
import { rankCandidates, type RankedCandidate, type StaffFilters } from "./staffing-picker";

export type PickerCandidate = {
  talentProfileId: string;
  name: string;
  availability: "free" | "busy" | "unknown";
  rating: number | null;
};

export type PickerRow = {
  talentProfileId: string;
  name: string;
  availability: RankedCandidate["availability"];
  rating: number | null;
  assigned: boolean;
  held: boolean;
};

export type PickerFilters = { showUnavailable: boolean; minRating: number | null; sortBy: "best" | "rating" };

export function pickerRows(
  candidates: readonly PickerCandidate[],
  state: { assignedIds: readonly string[]; heldIds: readonly string[] },
  filters: PickerFilters,
): PickerRow[] {
  const byId = new Map(candidates.map((c) => [c.talentProfileId, c]));
  const f: StaffFilters = {
    includeUnavailable: filters.showUnavailable,
    sortBy: filters.sortBy,
    ...(filters.minRating != null ? { minRating: filters.minRating } : {}),
  };
  const ranked = rankCandidates(
    candidates.map((c) => ({
      id: c.talentProfileId,
      name: c.name,
      available: c.availability === "free" ? true : c.availability === "busy" ? false : null,
      priceCents: null,
      rating: c.rating,
      distanceKm: null,
    })),
    f,
  );
  const assigned = new Set(state.assignedIds);
  const held = new Set(state.heldIds);
  return ranked.map((r) => ({
    talentProfileId: r.id,
    name: byId.get(r.id)?.name ?? r.name,
    availability: r.availability,
    rating: r.rating,
    assigned: assigned.has(r.id),
    held: held.has(r.id),
  }));
}

/** A row can be picked for a hold only when it is free and not already on the job or held. */
export function canHold(row: PickerRow): boolean {
  return row.availability === "free" && !row.assigned && !row.held;
}
