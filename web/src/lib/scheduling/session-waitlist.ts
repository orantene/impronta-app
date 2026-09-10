/**
 * session-waitlist.ts — the queue for a full class, and the one write that
 * moves somebody off it.
 *
 * THE HALF THAT WAS MISSING
 * ═════════════════════════
 * `class-waitlist.ts` has held `nextWaitlistInvite` — a pure rule for whose
 * turn it is — since M4, over a queue that did not exist in the database.
 * `20261231001100_session_waitlist.sql` is that queue. This module is the join:
 * it reads the rows, derives everything the rows deliberately do not store, and
 * calls `promote_session_waitlist_entry` for the one state change.
 *
 * EXPIRY IS DERIVED, NEVER STORED
 * ═══════════════════════════════
 * K07's rule is that an offer whose window has passed reads as expired rather
 * than silently vanishing. There is no sweep and none is wanted, so `expired`
 * is not a value of `status` at all: it is what `offered` plus a past
 * `offer_expires_at` MEANS, computed here at read time. A stored expiry would
 * need a cron to stay true, and between the lapse and the sweep the row would
 * claim to be a live offer while the RPC treated it as a lapsed one.
 *
 * POSITION IS DERIVED TOO. `joined_at` is the queue; the number beside a name
 * is its index. Storing positions means renumbering every row below whenever
 * one leaves, in a transaction nobody wrote, and a gap in the numbering then
 * looks like a lost customer.
 *
 * THE REFUSALS ARE DATA. Every failure comes back as `{ ok: false, reason }`
 * with a catalogue key, never as a thrown error, so a surface can render a
 * sentence instead of a stack trace.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { nextWaitlistInvite, type ClassWaitlistEntry } from "@/lib/scheduling/class-waitlist";

type Admin = Pick<SupabaseClient, "from" | "rpc">;

/** The stored statuses. `expired` is not one of them; see the header. */
export type WaitlistStoredStatus = "waiting" | "offered" | "accepted" | "withdrawn";

/** What an operator sees, once the offer window has been read against now. */
export type WaitlistState = WaitlistStoredStatus | "expired";

export type WaitlistEntry = {
  readonly id: string;
  readonly sessionId: string;
  readonly customerName: string;
  readonly customerEmail: string | null;
  readonly partySize: number;
  readonly status: WaitlistStoredStatus;
  readonly joinedAt: string;
  readonly offeredAt: string | null;
  readonly offerExpiresAt: string | null;
  /** 1-based place in the queue, derived from `joinedAt`. */
  readonly position: number;
  readonly state: WaitlistState;
};

/**
 * `offered` plus a window that has closed is `expired`. Everything else is
 * itself. An `offered` row with no window cannot exist — the table's own check
 * constraint refuses it — so a null window here is treated as expired rather
 * than as an offer that never ends.
 */
export function deriveWaitlistState(
  entry: { status: WaitlistStoredStatus; offerExpiresAt: string | null },
  now: Date,
): WaitlistState {
  if (entry.status !== "offered") return entry.status;
  if (!entry.offerExpiresAt) return "expired";
  const ms = Date.parse(entry.offerExpiresAt);
  if (!Number.isFinite(ms)) return "expired";
  return ms > now.getTime() ? "offered" : "expired";
}

type RawWaitlistRow = {
  id: string;
  session_id: string;
  customer_name: string;
  customer_email: string | null;
  party_size: number | null;
  status: string;
  joined_at: string;
  offered_at: string | null;
  offer_expires_at: string | null;
};

function toStoredStatus(raw: string): WaitlistStoredStatus {
  return raw === "offered" || raw === "accepted" || raw === "withdrawn" ? raw : "waiting";
}

/**
 * Number and interpret one session's queue. Ordering is by `joined_at`, with
 * the row id as the tiebreak so two people who joined in the same millisecond
 * keep one order across reloads rather than swapping under the operator.
 */
export function orderWaitlist(rows: readonly RawWaitlistRow[], now: Date): WaitlistEntry[] {
  return [...rows]
    .sort((a, b) => {
      const aMs = Date.parse(a.joined_at);
      const bMs = Date.parse(b.joined_at);
      const aOk = Number.isFinite(aMs);
      const bOk = Number.isFinite(bMs);
      if (aOk && bOk && aMs !== bMs) return aMs - bMs;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((row, index) => {
      const status = toStoredStatus(row.status);
      return {
        id: row.id,
        sessionId: row.session_id,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        partySize: typeof row.party_size === "number" && row.party_size > 0 ? row.party_size : 1,
        status,
        joinedAt: row.joined_at,
        offeredAt: row.offered_at,
        offerExpiresAt: row.offer_expires_at,
        position: index + 1,
        state: deriveWaitlistState({ status, offerExpiresAt: row.offer_expires_at }, now),
      };
    });
}

/**
 * Whose turn it is, through the rule that already existed.
 *
 * `nextWaitlistInvite` takes an invited-at and an expires-at and treats a
 * lapsed invitation as open again, which is exactly the behaviour a front desk
 * wants when somebody did not answer the phone. Accepted and withdrawn entries
 * have left the queue and are not offered to it.
 */
export function nextInLine(entries: readonly WaitlistEntry[], now: Date): WaitlistEntry | null {
  const open = entries.filter((e) => e.status === "waiting" || e.status === "offered");
  const queue: ClassWaitlistEntry[] = open.map((e) => ({
    id: e.id,
    sessionId: e.sessionId,
    // The pure rule is keyed by a customer id it never dereferences; the entry
    // id is the stable identifier this queue actually has.
    customerId: e.id,
    position: e.position,
    invitedAt: e.status === "offered" ? e.offeredAt : null,
    expiresAt: e.offerExpiresAt,
  }));
  const picked = nextWaitlistInvite(queue, now.toISOString());
  if (!picked) return null;
  return open.find((e) => e.id === picked.id) ?? null;
}

/* ── the write ─────────────────────────────────────────────────────────────── */

export type PromoteWaitlistReason =
  | "invalid"
  | "not_found"
  | "wrong_tenant"
  | "conflict"
  | "not_promotable"
  | "session_missing"
  | "session_not_open"
  | "no_pool"
  | "session_full"
  | "unavailable";

/** The catalogue leaf under `dashboard.adminAppointments.waitlist.refusal`. */
export type PromoteWaitlistRefusalKey =
  | "invalid"
  | "notFound"
  | "changedSinceOpened"
  | "notPromotable"
  | "sessionMissing"
  | "sessionNotOpen"
  | "noPool"
  | "sessionFull"
  | "unavailable";

const REFUSAL_KEYS: Readonly<Record<PromoteWaitlistReason, PromoteWaitlistRefusalKey>> = {
  invalid: "invalid",
  // One answer for a missing row and a row in another workspace: a staff member
  // must not learn that an id they guessed is real, only that it is not theirs.
  not_found: "notFound",
  wrong_tenant: "notFound",
  conflict: "changedSinceOpened",
  not_promotable: "notPromotable",
  session_missing: "sessionMissing",
  session_not_open: "sessionNotOpen",
  no_pool: "noPool",
  session_full: "sessionFull",
  unavailable: "unavailable",
};

export function describePromoteRefusal(
  reason: PromoteWaitlistReason,
): PromoteWaitlistRefusalKey {
  return REFUSAL_KEYS[reason];
}

const KNOWN_REASONS = new Set<string>(Object.keys(REFUSAL_KEYS));

export function toPromoteReason(raw: unknown): PromoteWaitlistReason {
  return typeof raw === "string" && KNOWN_REASONS.has(raw)
    ? (raw as PromoteWaitlistReason)
    : "unavailable";
}

export type PromoteWaitlistResult =
  | { ok: true; already: boolean; entryId: string; offerExpiresAt: string | null }
  | {
      ok: false;
      reason: PromoteWaitlistReason;
      refusalKey: PromoteWaitlistRefusalKey;
      /** Present on `session_full`, so the sentence can say how many are held. */
      outstandingOffers: number | null;
    };

/** How long a released place is held for the person it was offered to. */
export const DEFAULT_WAITLIST_OFFER_MINUTES = 30;

function refuse(reason: PromoteWaitlistReason, outstandingOffers: number | null = null): PromoteWaitlistResult {
  return { ok: false, reason, refusalKey: describePromoteRefusal(reason), outstandingOffers };
}

/**
 * Offer one freed place to one person.
 *
 * `expectedStatus` is the status the operator's SCREEN showed. The RPC refuses
 * with `conflict` when the stored status has moved on, which is the difference
 * between "you promoted the person you were looking at" and "you promoted
 * whoever happens to be in that row now".
 *
 * Every refusal arrives as data. A thrown error from the transport layer is
 * logged and mapped to `unavailable`, so no caller of this function has to
 * decide what an exception means to an operator.
 */
export async function promoteWaitlistEntry(
  admin: Admin,
  input: {
    tenantId: string;
    entryId: string;
    actorUserId: string;
    expectedStatus?: WaitlistStoredStatus | null;
    offerMinutes?: number;
  },
): Promise<PromoteWaitlistResult> {
  if (!input.tenantId || !input.entryId) return refuse("invalid");

  const { data, error } = await admin.rpc("promote_session_waitlist_entry", {
    p_tenant_id: input.tenantId,
    p_entry_id: input.entryId,
    p_actor_id: input.actorUserId || null,
    p_expected_status: input.expectedStatus ?? null,
    p_offer_minutes: input.offerMinutes ?? DEFAULT_WAITLIST_OFFER_MINUTES,
  });
  if (error) {
    logServerError("scheduling.promoteWaitlistEntry/rpc", error);
    return refuse("unavailable");
  }

  const reply = (data ?? {}) as {
    ok?: boolean;
    already?: boolean;
    reason?: string;
    entry_id?: string;
    offer_expires_at?: string | null;
    outstanding_offers?: number | null;
  };

  if (reply.ok !== true) {
    const reason = toPromoteReason(reply.reason);
    const outstanding =
      typeof reply.outstanding_offers === "number" ? reply.outstanding_offers : null;
    return refuse(reason, outstanding);
  }

  return {
    ok: true,
    already: reply.already === true,
    entryId: reply.entry_id ?? input.entryId,
    offerExpiresAt: reply.offer_expires_at ?? null,
  };
}
