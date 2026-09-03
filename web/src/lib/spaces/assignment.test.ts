/**
 * The assignment decision table, one test per row, plus the cases where two
 * rows interact. Refusals are tested by asserting the REASON, not just falsity:
 * "it said no" is not the same as "it said no for the right reason", and the
 * host stand shows the reason to a person standing in front of a guest.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  decideAssignment,
  rankCandidates,
  windowsOverlap,
  type AssignableSpace,
  type AssignmentRequest,
} from "./assignment";

const T7: AssignableSpace = {
  id: "t7", kind: "table", partyMin: 2, partyMax: 4, status: "active",
};
const T8: AssignableSpace = {
  id: "t8", kind: "table", partyMin: 2, partyMax: 4, status: "active",
};

function req(over: Partial<AssignmentRequest> = {}): AssignmentRequest {
  return {
    space: T7,
    partySize: 4,
    startsAt: "2026-09-10T20:00:00Z",
    endsAt: "2026-09-10T22:00:00Z",
    combinations: [],
    existing: [],
    scopeSpaceIds: null,
    ...over,
  };
}

test("rule 1 — a party inside the range is seated", () => {
  const d = decideAssignment(req({ partySize: 4 }));
  assert.deepEqual(d, { ok: true, spaceIds: ["t7"], oversized: false });
});

test("rule 2 — a party over the max is seated on a joined pair", () => {
  const d = decideAssignment(
    req({
      partySize: 6,
      combinations: [{ withSpaceId: "t8", partyMin: 5, partyMax: 8 }],
    }),
  );
  assert.deepEqual(d, { ok: true, spaceIds: ["t7", "t8"], oversized: false });
});

test("rule 3 — a party over the max with no join is refused, by reason", () => {
  const d = decideAssignment(req({ partySize: 6 }));
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.reason, "party_too_large");
});

test("rule 4 — a party under the minimum is ALLOWED, and flagged", () => {
  // A host seats two at a four-top on a quiet night. A system that refuses is
  // a system the host works around.
  const d = decideAssignment(req({ partySize: 2, space: { ...T7, partyMin: 3 } }));
  assert.equal(d.ok, true);
  assert.equal(d.ok === true && d.oversized, true);
});

test("rule 5 — a space outside the allocation's scope is refused", () => {
  const d = decideAssignment(req({ scopeSpaceIds: ["t8", "t9"] }));
  assert.equal(d.ok === false && d.reason, "space_not_in_scope");
});

test("rule 5 — a walk-in is unscoped and may be seated anywhere", () => {
  assert.equal(decideAssignment(req({ scopeSpaceIds: null })).ok, true);
});

test("rule 6 — an overlapping assignment on the same space is refused", () => {
  const d = decideAssignment(
    req({
      existing: [
        { spaceId: "t7", startsAt: "2026-09-10T21:00:00Z", endsAt: "2026-09-10T23:00:00Z" },
      ],
    }),
  );
  assert.equal(d.ok === false && d.reason, "space_double_booked");
});

test("rule 6 — a booking that ENDS as this one starts does not clash", () => {
  // Half-open. A table freed at 20:00 is seatable at 20:00, which is what a
  // turn time means; treating it as a clash loses a whole seating every night.
  const d = decideAssignment(
    req({
      existing: [
        { spaceId: "t7", startsAt: "2026-09-10T18:00:00Z", endsAt: "2026-09-10T20:00:00Z" },
      ],
    }),
  );
  assert.equal(d.ok, true);
});

test("rule 7 — an out-of-service space is refused", () => {
  const d = decideAssignment(req({ space: { ...T7, status: "out_of_service" } }));
  assert.equal(d.ok === false && d.reason, "space_out_of_service");
});

test("a room is not seatable — it is bought out, not sat at", () => {
  const d = decideAssignment(req({ space: { ...T7, kind: "room", partyMax: 40 } }));
  assert.equal(d.ok === false && d.reason, "space_not_bookable");
});

test("a join whose PARTNER is already booked is not offered", () => {
  // The bug this pins: checking the first table's availability and not the
  // partner's would double-seat the partner, which is rule 6 skipped once.
  const d = decideAssignment(
    req({
      partySize: 6,
      combinations: [{ withSpaceId: "t8", partyMin: 5, partyMax: 8 }],
      existing: [
        { spaceId: "t8", startsAt: "2026-09-10T21:00:00Z", endsAt: "2026-09-10T23:00:00Z" },
      ],
    }),
  );
  assert.equal(d.ok === false && d.reason, "party_too_large");
});

test("a join outside the scope is not offered", () => {
  const d = decideAssignment(
    req({
      partySize: 6,
      combinations: [{ withSpaceId: "t8", partyMin: 5, partyMax: 8 }],
      scopeSpaceIds: ["t7"],
    }),
  );
  assert.equal(d.ok === false && d.reason, "party_too_large");
});

test("windowsOverlap is half-open at both ends", () => {
  const a = ["2026-09-10T20:00:00Z", "2026-09-10T22:00:00Z"] as const;
  assert.equal(windowsOverlap(...a, "2026-09-10T22:00:00Z", "2026-09-11T00:00:00Z"), false);
  assert.equal(windowsOverlap(...a, "2026-09-10T18:00:00Z", "2026-09-10T20:00:00Z"), false);
  assert.equal(windowsOverlap(...a, "2026-09-10T21:00:00Z", "2026-09-10T21:30:00Z"), true);
  assert.equal(windowsOverlap(...a, "2026-09-10T19:00:00Z", "2026-09-11T00:00:00Z"), true);
});

test("rankCandidates prefers the SMALLEST space that still fits", () => {
  const six: AssignableSpace = { id: "t9", kind: "table", partyMin: 4, partyMax: 6, status: "active" };
  const two: AssignableSpace = { id: "t1", kind: "table", partyMin: 1, partyMax: 2, status: "active" };
  const ranked = rankCandidates([six, T7, two], 2);
  assert.deepEqual(ranked.map((s) => s.id), ["t1", "t7", "t9"]);
});

test("rankCandidates drops what cannot fit, what is closed, and what is not seatable", () => {
  const closed: AssignableSpace = { ...T8, status: "out_of_service" };
  const room: AssignableSpace = { id: "r1", kind: "room", partyMin: 1, partyMax: 40, status: "active" };
  const ranked = rankCandidates([T7, closed, room], 4);
  assert.deepEqual(ranked.map((s) => s.id), ["t7"]);
});

test("rankCandidates rotates, so concurrent bookers do not all fight over table one", () => {
  const spaces: AssignableSpace[] = ["a", "b", "c"].map((id) => ({
    id, kind: "table", partyMin: 1, partyMax: 4, status: "active",
  }));
  assert.deepEqual(rankCandidates(spaces, 2, 0).map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(rankCandidates(spaces, 2, 1).map((s) => s.id), ["b", "c", "a"]);
  assert.deepEqual(rankCandidates(spaces, 2, 2).map((s) => s.id), ["c", "a", "b"]);
  // Wraps, and a negative offset does not produce an empty list.
  assert.deepEqual(rankCandidates(spaces, 2, 3).map((s) => s.id), ["a", "b", "c"]);
  assert.equal(rankCandidates(spaces, 2, -1).length, 3);
});
