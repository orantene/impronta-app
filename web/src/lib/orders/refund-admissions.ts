/**
 * Which admissions a line refund takes, and what it may release.
 *
 * Rules are Events & Ticketing's, verified against the schema rather than
 * inferred. Pure: no row is read or written here.
 */

export type RefundAdmission = {
  id: string;
  orderLineId: string;
  /** Ordinal WITHIN a line. A retry key for webhook redelivery, NOT a join. */
  lineSeq: number;
  admittedCount: number;
  status: string;
};

export type AdmissionSelection =
  | { ok: true; admissionIds: string[] }
  | { ok: false; reason: "already_admitted"; availableCount: number }
  | { ok: false; reason: "not_enough_admissions"; availableCount: number };

/**
 * Pick `count` admissions from a line to refund.
 *
 * NEVER an admission with `admittedCount > 0`. Someone who walked in and then
 * wants money back is a DISPUTE, not a refund-by-line, and this path must not
 * be able to reach them. Four tickets, two scanned, a request for three:
 * refused, naming what was actually available — so the refusal tells a venue
 * what it CAN do rather than only what it cannot.
 *
 * Among the unadmitted, HIGHEST `lineSeq` first. Not semantic, a tie-break: the
 * buyer's FIRST tickets survive, which starts mattering the moment holders are
 * named and seq 0 is Ana while seq 3 is the spare.
 */
export function selectAdmissionsForRefund(
  admissions: readonly RefundAdmission[],
  count: number,
): AdmissionSelection {
  const unadmitted = admissions
    .filter((a) => a.admittedCount <= 0 && a.status !== "refunded")
    .sort((a, b) => b.lineSeq - a.lineSeq);

  if (count <= 0) return { ok: false, reason: "not_enough_admissions", availableCount: unadmitted.length };

  if (unadmitted.length < count) {
    // Distinguish "some were scanned" from "there were never that many". A
    // venue reads these differently: one is a dispute, the other a typo.
    const scanned = admissions.some((a) => a.admittedCount > 0);
    return {
      ok: false,
      reason: scanned ? "already_admitted" : "not_enough_admissions",
      availableCount: unadmitted.length,
    };
  }
  return { ok: true, admissionIds: unadmitted.slice(0, count).map((a) => a.id) };
}

export type CapacityRelease =
  | { release: true; reason: "whole_line_refunded" }
  | { release: false; reason: "partial_refund_cannot_release_units" };

/**
 * May this refund release the line's capacity allocation?
 *
 * ONLY for a whole-line refund, and the reason is a real engine limit rather
 * than caution: `release_capacity(p_allocation_ids uuid[])` releases WHOLE
 * allocations, and `createPurchase` reserves ONE allocation of N units per
 * line. There is no call that returns two seats of four.
 *
 * So a partial refund deliberately does NOT release. The seat stays held and
 * cannot be resold until the show is over — a revenue cost the venue can SEE.
 * Releasing the whole allocation instead would free all four seats while two
 * tickets are still valid: an oversell by exactly the number kept, discovered
 * by a person at a door who cannot get in. A visible cost beats an invisible
 * one, and a wrong number that looks right is worse than either.
 *
 * The partial-release primitive is Capacity's to build; until it exists this
 * is the honest behaviour, not a workaround pretending to be complete.
 */
export function capacityReleaseFor(isWholeLineRefund: boolean): CapacityRelease {
  return isWholeLineRefund
    ? { release: true, reason: "whole_line_refunded" }
    : { release: false, reason: "partial_refund_cannot_release_units" };
}
