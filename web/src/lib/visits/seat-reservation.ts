import "server-only";

/**
 * Seating a HELD table has to touch the reservation that was holding it.
 *
 * THE BUG THIS CLOSES. The floor derives "held" from an `admissions` row that
 * is due any minute (`deriveHeldSpaces`). Opening a visit on that table made
 * the card read "occupied" and left the admission exactly as it was: still
 * `admitted_count = 0`, so the reservations desk went on showing the party as
 * arriving, then as running late, then the grace job could stamp a no-show on
 * guests who were sitting at the table eating. Two screens, one party, two
 * opposite answers.
 *
 * `check_in` IS THE ONLY AUTHORITY. The arithmetic on `admitted_count` and the
 * `seated_at` stamp belong to Events & Ticketing's SECURITY DEFINER function,
 * under its row lock — the same one the QR door and the walk-up door call. A
 * direct `UPDATE admissions SET admitted_count = party_size` here would be the
 * second implementation that function exists to prevent, and it would race two
 * hosts seating one booking. So this module resolves WHICH admission, proves
 * it belongs to this workspace and to the table actually being seated, and
 * then calls the function.
 *
 * SEATING IS NOT UNDONE BY A FAILED CHECK-IN. The party is at the table; the
 * visit is open and the check is real. A refusal here is reported to the host
 * as its own sentence ("Seated. The reservation could not be marked arrived.")
 * rather than rolled back into "we could not seat you", which would be a lie
 * about the room.
 */

import { logServerError } from "@/lib/server/safe-error";
import { doorOutcomeForCheckIn } from "@/lib/sessions/door";

type Admin = {
  // Same injectable seam as the rest of `lib/visits`, plus `rpc` — this is the
  // one command in the area that goes through a database function.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // PostgREST's builder is a thenable, not a Promise, so the seam is declared
  // as one — otherwise the real client does not satisfy the shape the tests do.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
};

export type SeatReservationReason =
  /** No admission with that id in this workspace. Same answer for both, on purpose. */
  | "reservation_not_found"
  /** The booking is held for a different table than the one being seated. */
  | "reservation_other_table"
  /** Refunded or void: a commercial fact the host has to be told before seating. */
  | "reservation_not_valid"
  /** Everyone on the booking was already admitted. */
  | "reservation_already_seated"
  | "unavailable";

export type SeatReservationResult =
  | { ok: true; admissionId: string; admittedCount: number; partySize: number }
  | { ok: false; reason: SeatReservationReason };

type AdmissionScopeRow = {
  id: string;
  tenant_id: string;
  space_id: string | null;
  status: string;
};

export async function markReservationSeated(
  admin: Admin,
  input: {
    tenantId: string;
    admissionId: string;
    /**
     * Every space this seating covers: the table, plus the joined second table
     * when two were pushed together. A booking held for either half is the
     * booking this seating is fulfilling.
     */
    spaceIds: readonly string[];
    actorUserId: string | null;
  },
): Promise<SeatReservationResult> {
  if (!input.tenantId || !input.admissionId) {
    return { ok: false, reason: "reservation_not_found" };
  }

  // Tenant scope BEFORE the RPC, because `check_in` has no tenant predicate:
  // it takes an id and admits. Service role sees every workspace's rows, so
  // this read is the only thing standing between a guessed uuid and someone
  // else's booking being marked as arrived.
  const { data, error } = await admin
    .from("admissions")
    .select("id, tenant_id, space_id, status")
    .eq("id", input.admissionId)
    .maybeSingle();
  if (error) {
    logServerError("visits.seatReservation.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "reservation_not_found" };
  const row = data as AdmissionScopeRow;
  // "Not yours" and "does not exist" answer identically: a workspace learns
  // nothing about another's book by probing ids.
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "reservation_not_found" };
  if (row.status !== "valid") return { ok: false, reason: "reservation_not_valid" };
  // A booking already assigned to a table may only be closed out by seating
  // THAT table. An unassigned booking (`space_id` null is a valid state — the
  // host had not placed them yet) is placed by this seating, below.
  if (row.space_id !== null && !input.spaceIds.includes(row.space_id)) {
    return { ok: false, reason: "reservation_other_table" };
  }

  const { data: reply, error: rpcError } = await admin.rpc("check_in", {
    p_admission_id: row.id,
    p_mode: "actor",
    p_count: null,
    p_actor: input.actorUserId,
    p_token_version: null,
  });
  if (rpcError) {
    logServerError("visits.seatReservation.check_in", rpcError);
    return { ok: false, reason: "unavailable" };
  }

  const outcome = doorOutcomeForCheckIn(reply as never);
  if (outcome.kind === "already_in") return { ok: false, reason: "reservation_already_seated" };
  if (outcome.kind === "not_valid") return { ok: false, reason: "reservation_not_valid" };
  if (outcome.kind === "unknown_ticket") return { ok: false, reason: "reservation_not_found" };
  if (outcome.kind !== "admitted") {
    logServerError("visits.seatReservation.outcome", new Error(outcome.kind));
    return { ok: false, reason: "unavailable" };
  }

  // The booking now has a table. Best-effort and AFTER the admission is
  // stamped: a failure here loses the table code on the desk's row, which is
  // cosmetic, where refusing the seating would be a lie about the room.
  if (row.space_id === null && input.spaceIds.length > 0) {
    const { error: placeError } = await admin
      .from("admissions")
      .update({ space_id: input.spaceIds[0] })
      .eq("id", row.id)
      .eq("tenant_id", input.tenantId);
    if (placeError) logServerError("visits.seatReservation.place", placeError);
  }

  return {
    ok: true,
    admissionId: row.id,
    admittedCount: outcome.admittedCount,
    partySize: outcome.partySize,
  };
}
