/**
 * staffing-picker.ts — choosing people for a request by availability, price,
 * rating and distance (TUL-1373). For any coordinator of any agency or network.
 * Pure.
 *
 * A missing value (no price set, no rating yet, distance unknown) is UNKNOWN,
 * never zero: it does not pass a filter that asks for that dimension, and it
 * sorts last on its own dimension. Availability unknown is not "free".
 */

export type StaffCandidate = {
  id: string;
  name: string;
  /** Free for the whole requested window: true / false, or null when it could not be checked. */
  available: boolean | null;
  priceCents: number | null;
  /** 0 to 5. */
  rating: number | null;
  distanceKm: number | null;
};

export type StaffFilters = {
  /** Also list people who are busy or whose availability is unknown (flagged, after the free ones). */
  includeUnavailable?: boolean;
  maxPriceCents?: number;
  minRating?: number;
  maxDistanceKm?: number;
  sortBy?: "best" | "price" | "rating" | "distance";
};

export type RankedCandidate = StaffCandidate & { availability: "free" | "busy" | "unknown" };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Lower is better. Unknown is Infinity so it sorts last. */
function priceKey(c: StaffCandidate) {
  return num(c.priceCents) ? c.priceCents : Infinity;
}
function ratingKey(c: StaffCandidate) {
  return num(c.rating) ? -c.rating : Infinity;
}
function distanceKey(c: StaffCandidate) {
  return num(c.distanceKm) ? c.distanceKm : Infinity;
}

export function rankCandidates(candidates: readonly StaffCandidate[], f: StaffFilters): RankedCandidate[] {
  const out: RankedCandidate[] = [];
  for (const c of candidates) {
    const availability = c.available === true ? "free" : c.available === false ? "busy" : "unknown";
    if (availability !== "free" && !f.includeUnavailable) continue;
    if (num(f.maxPriceCents) && !(num(c.priceCents) && c.priceCents <= f.maxPriceCents)) continue;
    if (num(f.minRating) && !(num(c.rating) && c.rating >= f.minRating)) continue;
    if (num(f.maxDistanceKm) && !(num(c.distanceKm) && c.distanceKm <= f.maxDistanceKm)) continue;
    out.push({ ...c, availability });
  }
  const free = (r: RankedCandidate) => (r.availability === "free" ? 0 : 1);
  const sortBy = f.sortBy ?? "best";
  // "best": higher rating first, then nearer, then cheaper (each unknown last).
  const keys: Array<(c: StaffCandidate) => number> =
    sortBy === "price" ? [priceKey] : sortBy === "rating" ? [ratingKey] : sortBy === "distance" ? [distanceKey] : [ratingKey, distanceKey, priceKey];
  return out.sort((a, b) => {
    const fa = free(a) - free(b);
    if (fa !== 0) return fa;
    for (const k of keys) {
      const x = k(a);
      const y = k(b);
      if (x !== y) return x < y ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
