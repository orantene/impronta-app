/**
 * Seating a party at a place — the decision, as a pure function.
 *
 * PURE, and separate from the API for the usual reason: CI carries no
 * service-role credentials, so anything that touches the database gates
 * nowhere. The rules are here and tested on every change; the API below them
 * fetches rows and calls the capacity engine.
 *
 * THE DECISION TABLE (from docs/plans/spaces-seating-plan.md)
 *
 *   1  party inside the space's range                      allowed
 *   2  party over max, a combination covers it             allowed, both spaces
 *   3  party over max, no combination                      party_too_large
 *   4  party under min                                     allowed, with a note
 *   5  space outside the group the allocation was made in  space_not_in_scope
 *   6  overlapping assignment already on that space        space_double_booked
 *   7  space out of service                                space_out_of_service
 *   8  an ancestor is held over the window                 blocked_by_parent
 *   9  no space at all                                     valid; the host assigns later
 *
 * RULE 4 IS ALLOWED ON PURPOSE. A host seats two people at a four-top all the
 * time — on a quiet night, or because the two-tops are by the kitchen door. A
 * system that refuses it is a system the host works around, and a host working
 * around the floor plan is how the floor plan stops matching the room.
 *
 * RULE 8 IS NOT CHECKED HERE. The ancestor rule belongs to the capacity engine
 * and is enforced by its reserve, which refuses with `ancestor_full`. Re-deriving
 * it in application code would be a second implementation of someone else's
 * invariant, free to drift. This module reports what it can see; the engine has
 * the final say and its refusal is the answer.
 */

export type AssignmentRefusal =
  | "party_too_large"
  | "space_not_in_scope"
  | "space_double_booked"
  | "space_out_of_service"
  | "space_not_bookable";

export type AssignableSpace = {
  id: string;
  kind: string;
  partyMin: number;
  partyMax: number;
  status: "active" | "out_of_service";
};

export type ExistingAssignment = {
  spaceId: string;
  startsAt: string;
  endsAt: string;
};

export type AssignmentRequest = {
  space: AssignableSpace;
  partySize: number;
  startsAt: string;
  endsAt: string;
  /** Spaces this space can be joined with, and the party range each join covers. */
  combinations: ReadonlyArray<{ withSpaceId: string; partyMin: number; partyMax: number }>;
  /** Every space already assigned in the window being considered. */
  existing: readonly ExistingAssignment[];
  /**
   * The spaces the allocation may be seated in — the group's members, or the
   * layout's included spaces. `null` means unscoped, which a walk-in is.
   */
  scopeSpaceIds: readonly string[] | null;
};

export type AssignmentDecision =
  | {
      ok: true;
      /** Every space to seat, which is more than one for a joined party. */
      spaceIds: string[];
      /** True when the party is smaller than the space's minimum (rule 4). */
      oversized: boolean;
    }
  | { ok: false; reason: AssignmentRefusal; detail?: string };

/** Half-open overlap: a table freed at 22:00 can be re-seated at 22:00. */
export function windowsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Only a bookable leaf can hold a party. A room is bought out, not seated at. */
const SEATABLE_KINDS = new Set([
  "table", "seat", "chair", "booth", "cabana", "court", "lane", "desk", "bed", "bay", "unit",
]);

export function decideAssignment(req: AssignmentRequest): AssignmentDecision {
  const { space, partySize } = req;

  if (!SEATABLE_KINDS.has(space.kind)) {
    return { ok: false, reason: "space_not_bookable", detail: space.kind };
  }
  if (space.status === "out_of_service") {
    return { ok: false, reason: "space_out_of_service" };
  }
  if (req.scopeSpaceIds !== null && !req.scopeSpaceIds.includes(space.id)) {
    return { ok: false, reason: "space_not_in_scope" };
  }

  const clash = req.existing.find(
    (e) =>
      e.spaceId === space.id &&
      windowsOverlap(req.startsAt, req.endsAt, e.startsAt, e.endsAt),
  );
  if (clash) return { ok: false, reason: "space_double_booked", detail: clash.spaceId };

  // Rule 1: it fits on its own.
  if (partySize <= space.partyMax) {
    return { ok: true, spaceIds: [space.id], oversized: partySize < space.partyMin };
  }

  // Rule 2: a join covers it. The partner must also be free over the window —
  // a combination that ignores the partner's own bookings would double-seat it,
  // which is the same bug as skipping rule 6 for the first table.
  const join = req.combinations.find(
    (c) =>
      partySize >= c.partyMin &&
      partySize <= c.partyMax &&
      (req.scopeSpaceIds === null || req.scopeSpaceIds.includes(c.withSpaceId)) &&
      !req.existing.some(
        (e) =>
          e.spaceId === c.withSpaceId &&
          windowsOverlap(req.startsAt, req.endsAt, e.startsAt, e.endsAt),
      ),
  );
  if (join) {
    return { ok: true, spaceIds: [space.id, join.withSpaceId], oversized: false };
  }

  // Rule 3.
  return { ok: false, reason: "party_too_large", detail: String(space.partyMax) };
}

/**
 * The spaces that could take this party, best fit first.
 *
 * Best fit is the SMALLEST space that still holds the party, so a party of two
 * does not consume a six-top while two-tops sit empty. Ties are broken by a
 * rotating offset rather than always starting at the same table: a deterministic
 * order makes every concurrent booker contend on the same row and pay the pool
 * lock on every attempt. (The Capacity Engine Manager's note; the reserve itself
 * is atomic, so this is contention, not correctness.)
 */
export function rankCandidates(
  spaces: readonly AssignableSpace[],
  partySize: number,
  rotateBy = 0,
): AssignableSpace[] {
  const fits = spaces.filter(
    (s) =>
      s.status === "active" && SEATABLE_KINDS.has(s.kind) && partySize <= s.partyMax,
  );
  const sorted = [...fits].sort((a, b) => a.partyMax - b.partyMax || a.id.localeCompare(b.id));
  if (sorted.length === 0 || rotateBy === 0) return sorted;
  const offset = ((rotateBy % sorted.length) + sorted.length) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}
