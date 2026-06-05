// Pure, side-effect-free helpers for the inquiry waitlist / alternates engine.
//
// Extracted so the rank-ordering and promote-guard rules are unit-testable
// without a database (see alternates-logic.test.ts). The engine
// (inquiry-engine-alternates.ts) imports these and supplies the DB I/O.

/**
 * Given the caller-supplied ordered list of alternate ids, return the
 * (id, rank) assignments to persist. Rank is dense and 0-based, matching the
 * ascending read order used by loadInquiryAlternates.
 *
 * Ids not present in `knownIds` are dropped (defends against a stale client
 * sending an id that no longer belongs to the inquiry). Duplicate ids keep
 * their first position only.
 */
export function computeRankAssignments(
  orderedIds: string[],
  knownIds: Iterable<string>,
): Array<{ id: string; rank: number }> {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
  const seen = new Set<string>();
  const out: Array<{ id: string; rank: number }> = [];
  let rank = 0;
  for (const id of orderedIds) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, rank: rank++ });
  }
  return out;
}

/**
 * The next rank value to append a new alternate at: one past the current max,
 * or 0 when the waitlist is empty.
 */
export function nextAppendRank(existingRanks: readonly number[]): number {
  if (existingRanks.length === 0) return 0;
  let max = -1;
  for (const r of existingRanks) {
    if (Number.isFinite(r) && r > max) max = r;
  }
  return max + 1;
}

export type PromoteGuardReason = "already_active" | "already_invited";

/**
 * Decide whether an alternate's talent can be promoted onto the roster.
 *
 * Returns `{ ok: true }` when the talent has no live (invited/active)
 * participant row — promotion is safe. Returns a friendly reason otherwise so
 * the engine never inserts a duplicate live participant.
 *
 * `participantStatuses` is the list of statuses of the talent's existing
 * participant rows on this inquiry (a talent may have a stale
 * declined/removed row — that does NOT block promotion).
 */
export function evaluatePromoteGuard(
  participantStatuses: readonly string[],
): { ok: true } | { ok: false; reason: PromoteGuardReason } {
  if (participantStatuses.includes("active")) {
    return { ok: false, reason: "already_active" };
  }
  if (participantStatuses.includes("invited")) {
    return { ok: false, reason: "already_invited" };
  }
  return { ok: true };
}
