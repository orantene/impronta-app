/**
 * door.ts — what the door SHOWS, decided separately from what the door DOES.
 *
 * PURE. No Supabase, no crypto, no environment — so it runs in every lane and
 * the mapping below is testable without a database or a secret.
 *
 *
 * WHY THE MAPPING IS ITS OWN LAYER
 * ════════════════════════════════
 * Four things can refuse a scan and they fail at different distances:
 *
 *   the SIGNATURE      — `verifyAdmissionToken`, in the app, no round trip
 *   the SCOPE          — tenant and session, in the app, before the RPC
 *   the ROW            — `check_in`, in Postgres, under the row lock
 *   the CONFIGURATION  — no secret set at all
 *
 * A door that collapses them into "no" sends staff to argue with a customer
 * about a problem the customer does not have. `no_secret` is an outage,
 * `bad_signature` is a forgery, `token_superseded` is a ticket that was
 * transferred, and `refunded` is a person who paid and got their money back.
 * Four different conversations, and the person holding the phone has to know
 * which one they are in before they open their mouth.
 *
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ═════════════════════════════════
 * It does not decide entitlement. `check_in` does, under the lock, and this
 * only renders the answer. A mapper that could say "admitted" without the row
 * having said so would be a second authority outside the lock — the same
 * mistake as a verifier that authorises, one layer up.
 */

/** Everything the door can be told, from any of the three sources. */
export type DoorOutcome =
  | { kind: "admitted"; admitted: number; admittedCount: number; partySize: number; remaining: number; wasMarkedNoShow: boolean }
  /** A real ticket, already used up. Not an error — a queue-management fact. */
  | { kind: "already_in"; admittedCount: number; partySize: number }
  /** Genuine signature, superseded version: transferred or re-issued. */
  | { kind: "superseded" }
  /**
   * A real, valid, unused ticket — for a DIFFERENT night than this door.
   *
   * Separate from `unknown_ticket` because the two send staff into different
   * conversations. "Not found" invites a scan retry and then an argument;
   * "this is Friday's ticket" ends it in one sentence. `ticketStartsAt` is
   * carried so the door can say WHICH night rather than just "not tonight" —
   * null when the admission is anchored to no session at all.
   */
  | { kind: "wrong_session"; ticketStartsAt: string | null }
  /** Commercially not good: refunded, void. The row's own word is carried. */
  | { kind: "not_valid"; status: string }
  /** The token is not ours, or was tampered with. */
  | { kind: "forged" }
  /** WE are misconfigured. Never shown as the holder's problem. */
  | { kind: "door_misconfigured" }
  | { kind: "unknown_ticket" }
  /** Asked to admit more people than the row has left. */
  | { kind: "too_many"; remaining: number; requested: number }
  | { kind: "engine_error"; detail: string };

/** The shape `verifyAdmissionToken` returns, restated so this stays pure. */
export type TokenVerdict =
  | { ok: true; admissionId: string; tokenVersion: number }
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" };

/** The shape `check_in` returns, as far as the door cares. */
export type CheckInReply = {
  ok?: boolean;
  reason?: string;
  status?: string;
  admitted?: number;
  admittedCount?: number;
  partySize?: number;
  remaining?: number;
  requested?: number;
  wasMarkedNoShow?: boolean;
};

/**
 * A signature verdict that is not `ok` becomes a door outcome WITHOUT a round
 * trip. There is nothing to ask the database: an unsigned string names no
 * admission, so querying one would be looking up an id an attacker chose.
 */
export function doorOutcomeForToken(verdict: TokenVerdict): DoorOutcome | null {
  if (verdict.ok) return null;
  switch (verdict.reason) {
    case "no_secret":
      // OUR failure, and it must never read as the holder's. A door with no
      // secret cannot verify anything, so it also must not fall back to
      // admitting — a missing env var would become an open door.
      return { kind: "door_misconfigured" };
    case "malformed":
    case "bad_signature":
    default:
      return { kind: "forged" };
  }
}

/**
 * Is this admission for the night this door is standing at?
 *
 * WHY THIS EXISTS AT ALL. `check_in` takes no session and asks for none: it
 * decides entitlement on ONE admission row and is right to, because a session
 * predicate inside it would have to be optional (walk-ins and band bookings
 * legitimately have no session) and an optional predicate on an authorisation
 * function fails open on omission — the exact hazard migration `…000374`
 * exists to close for `p_mode`. So the session scope is the CALLER'S job, the
 * same obligation and for the same reason as the tenant scope beside it.
 *
 * Until this function existed nobody discharged it, and Friday's ticket
 * admitted on Saturday: the signature verifies (it is genuine), the tenant
 * matches (it is ours), the version matches (it was never re-issued), the
 * status is valid (nobody refunded it) and the party has room (it was never
 * used). Every gate says yes, because none of them was ever asked the
 * question that matters.
 *
 * `doorSessionId` is NOT nullable, so a door with no session cannot call this
 * with `undefined` and be waved through — it cannot construct the call at all.
 *
 * AN ADMISSION WITH NO SESSION IS ALSO REFUSED. Cases 4 and 5 of the anchor
 * table (a band reservation, a walk-in against a pool) carry `session_id NULL`
 * legitimately, but "legitimate row" and "belongs at tonight's door" are
 * different facts. `loadDoor` lists tonight by `session_id = <this session>`,
 * so such a row is not on the list and admitting it would put a person through
 * a door whose count will never mention them.
 *
 * Returns null to mean PROCEED, so a caller that forgets to branch on the
 * result gets a type error rather than a silent admission.
 */
export function doorOutcomeForSessionScope(args: {
  doorSessionId: string;
  admissionSessionId: string | null;
  ticketStartsAt: string | null;
}): DoorOutcome | null {
  if (args.admissionSessionId !== null && args.admissionSessionId === args.doorSessionId) {
    return null;
  }
  return { kind: "wrong_session", ticketStartsAt: args.ticketStartsAt };
}

/**
 * Map `check_in`'s reply onto what the door shows.
 *
 * An unrecognised reason becomes `engine_error` carrying the raw string rather
 * than a cheerful default. A door that renders "no" for a reason it does not
 * understand is a door that hides a new refusal the day someone adds one.
 */
export function doorOutcomeForCheckIn(reply: CheckInReply | null | undefined): DoorOutcome {
  if (!reply || typeof reply !== "object") {
    return { kind: "engine_error", detail: "no reply" };
  }

  if (reply.ok === true) {
    return {
      kind: "admitted",
      admitted: Number(reply.admitted ?? 0),
      admittedCount: Number(reply.admittedCount ?? 0),
      partySize: Number(reply.partySize ?? 0),
      remaining: Number(reply.remaining ?? 0),
      // Carried, not swallowed: somebody may already have been charged a
      // no-show fee, and the person at the door is the one who can say so.
      wasMarkedNoShow: reply.wasMarkedNoShow === true,
    };
  }

  switch (reply.reason) {
    case "already_admitted":
      return {
        kind: "already_in",
        admittedCount: Number(reply.admittedCount ?? 0),
        partySize: Number(reply.partySize ?? 0),
      };
    case "token_superseded":
      return { kind: "superseded" };
    case "token_version_required":
      // The caller failed to say which door it is. That is our bug, not a
      // ticket problem, so it must not render as a refusal of the holder.
      return { kind: "engine_error", detail: "token_version_required" };
    case "not_valid":
      return { kind: "not_valid", status: String(reply.status ?? "not_valid") };
    case "unknown_admission":
      return { kind: "unknown_ticket" };
    case "exceeds_remaining":
      return {
        kind: "too_many",
        remaining: Number(reply.remaining ?? 0),
        requested: Number(reply.requested ?? 0),
      };
    default:
      return { kind: "engine_error", detail: String(reply.reason ?? "unknown") };
  }
}

/**
 * Does this outcome mean the person may walk in?
 *
 * One place, so no surface can decide it for itself. `already_in` is
 * deliberately NOT admittance: the ticket is real and used, which is a
 * different sentence from "come in" and from "this is fake".
 */
export function doorAdmits(outcome: DoorOutcome): boolean {
  return outcome.kind === "admitted";
}
