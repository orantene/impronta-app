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

/**
 * What one `refund_admission` call actually achieved.
 *
 * THE DEFECT THIS CLOSES. The executor had two failure paths for the same
 * effect and only one of them reported. A failed *read* of `admissions` set
 * `admissionsIncomplete`; a failed *call* to `refund_admission` logged and
 * continued, leaving `stamped` short and the flag false. So the caller was
 * told "refund complete, every ticket voided" while a ticket still admitted
 * and its seat stayed committed against the pool — the precise outcome the
 * atomic RPC exists to prevent, lost one layer up by not classifying a reply.
 *
 * `already` is a SUCCESS. The RPC is idempotent by identity and short-circuits
 * a `refunded` row to `ok, already`, so a retried cron run must count it as
 * done rather than as an unresolved effect that never clears.
 */
export type AdmissionEffect =
  /** Stamped refunded and its seat released, now or on an earlier attempt. */
  | { effect: "stamped"; already: boolean }
  /**
   * The effect did NOT land. Retrying is safe — `refund_admission` is
   * idempotent — but the money legs are not, so this is reported alongside a
   * successful refund rather than turned into a failure of the whole refund.
   */
  | { effect: "incomplete"; why: "rpc_error" | "refused"; reason: string | null }
  /**
   * Deliberately not attempted: somebody walked in. A dispute, not a refund.
   * Not `incomplete`, because no retry will ever change it and an exceptions
   * queue that never empties is one nobody reads.
   */
  | { effect: "skipped"; why: "already_admitted" };

/** Should this row be sent to `refund_admission` at all? */
export function admissionIsRefundable(row: { admittedCount: number; status: string }): boolean {
  if (row.admittedCount > 0) return false;
  // `void` is refundable, not skippable: `cancel_event_cascade` closes the door
  // at the moment of the decision and leaves the money to the refund cron.
  return row.status === "valid" || row.status === "void";
}

/**
 * Classify one reply. Pure, so the failure case is testable without a fake
 * Postgres — and the failure case is the one that was wrong.
 */
export function classifyAdmissionEffect(
  reply: { ok?: boolean; reason?: string } | null,
  error: { message?: string } | null,
): AdmissionEffect {
  if (error) {
    return { effect: "incomplete", why: "rpc_error", reason: error.message ?? null };
  }
  if (reply?.ok === true) {
    return { effect: "stamped", already: reply.reason === "already" || (reply as { already?: boolean }).already === true };
  }
  if (reply?.reason === "already_admitted") {
    return { effect: "skipped", why: "already_admitted" };
  }
  return { effect: "incomplete", why: "refused", reason: reply?.reason ?? null };
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
