/**
 * waitlist-desk.ts — the read and the first write of the session waitlist,
 * over a Supabase client the caller has already scoped.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT IN `appointments-actions.ts`
 * ═══════════════════════════════════════════════════════════════════
 * The same reason `appointments-lookups.ts` exists: that file is
 * `"use server"`, so every export of it is a browser-callable action and
 * nothing inside it can be driven by anything except a signed-in staff
 * request. The consequence was not a style problem. It meant the whole
 * waitlist journey could only ever be exercised by a human with a browser,
 * and it never was.
 *
 * These two functions take the admin client as an argument. The actions in
 * `appointments-actions.ts` prove the caller is staff of the tenant and then
 * call THESE, so `scripts/proof-appointments-journey.ts` drives the identical
 * code against the isolated database and the screen and the proof cannot
 * diverge.
 *
 * THE DEFECT THIS FILE CLOSES
 * ═══════════════════════════
 * `loadSessionWaitlists` built its list of sessions out of the waitlist rows
 * that already existed:
 *
 *     if (entries.length === 0) return { ok: true, sessions: [] };
 *
 * So a workspace with a full class and nobody queued got an empty list, the
 * screen drew its empty state, and the "add somebody to this list" control —
 * which lives on a session card — never rendered. The first person could not
 * be put on any queue through the interface, so nothing could ever be
 * promoted, and `joinSessionWaitlist` with its refusals was unreachable code.
 * A queue you can only add to once it is not empty is not a queue.
 *
 * THE RULE NOW. A session belongs on this desk when somebody is already
 * waiting for it, OR when the engine says it has no seats left. The second
 * half is the entry point: a class that just sold out appears here by itself,
 * with an empty queue and a control to start one. A class with seats still on
 * it stays off the desk, because the answer there is to sell one, not to
 * start a queue — which is the same thing `joinWaitlist` refuses with
 * `seatsAvailable`.
 *
 * FULL IS AN ANSWER FROM THE ENGINE, NEVER A COUNT HERE, and never the
 * ABSENCE of an answer: `capacity_remaining_public` returning nothing is not
 * "no seats left". The three states a session's seats can be in are three
 * shapes of `WaitlistSeats`, not one nullable number, because a nullable
 * number is where "unknown" gets read as "zero" and a class is silently
 * declared full.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { nextInLine, orderWaitlist, type WaitlistEntry } from "@/lib/scheduling/session-waitlist";

type Admin = Pick<SupabaseClient, "from" | "rpc">;

/** How far ahead the desk looks for a class that has filled up. */
export const WAITLIST_HORIZON_DAYS = 90;

/**
 * How many upcoming sessions are examined for fullness in one read.
 *
 * A front desk works the near horizon, and each candidate costs one
 * `capacity_remaining_public` call. Two kinds of session are never subject to
 * this cap, because a cap that silently hides one is the same defect this file
 * exists to close: a session somebody is ALREADY waiting for arrives through
 * the entries, and the session an operator explicitly asked for arrives
 * through `alwaysInclude`. When the cap does bite, `truncated` says so and the
 * screen prints a sentence rather than looking like a workspace with nothing
 * full in it.
 */
export const WAITLIST_CANDIDATE_LIMIT = 60;

/** How many seat reads are in flight at once. */
const REMAINING_CONCURRENCY = 6;

const GENERIC_LOAD_ERROR = "Could not load the waitlist.";

/**
 * What is known about a session's seats. Three states, three shapes.
 *
 * `uncounted` and `unreadable` are NOT the same thing and neither is zero.
 * Nothing ever counted seats for an `uncounted` session, so no place can ever
 * be said to have come free on it; an `unreadable` one has seats and the read
 * failed this time.
 */
export type WaitlistSeats =
  | { kind: "counted"; total: number; remaining: number }
  | { kind: "unreadable"; total: number }
  | { kind: "uncounted" };

export type WaitlistView = {
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly seats: WaitlistSeats;
  readonly entries: WaitlistEntry[];
  /** The id `nextWaitlistInvite` says should be offered the next free place. */
  readonly nextInLineId: string | null;
};

export type WaitlistDeskResult =
  | {
      ok: true;
      sessions: WaitlistView[];
      /**
       * How many upcoming sessions were left off because their seats could
       * not be read. Never silently zero: the screen says a sentence about it,
       * because a list that is short for a reason nobody is told is the shape
       * of defect this file exists to close.
       */
      unreadableSessions: number;
      /** True when there are more upcoming sessions than were examined. */
      truncated: boolean;
      /** How many were examined, so the sentence can name the number. */
      checkedAhead: number;
    }
  | { ok: false; error: string };

/**
 * Whose queue is worth showing. The whole entry-point fix is this predicate.
 *
 * Pure, and exported, because it is the one decision in this module that can
 * be checked without a database and it is the one that was wrong.
 */
export function belongsOnWaitlistDesk(input: {
  hasEntries: boolean;
  seats: WaitlistSeats;
}): boolean {
  if (input.hasEntries) return true;
  // No queue yet: only a session the engine has actually called full earns a
  // card. Not `uncounted` (nothing ever counted its seats, so nothing could
  // ever tell this person a place came free) and not `unreadable` (a failed
  // read is not a full class).
  return input.seats.kind === "counted" && input.seats.remaining <= 0;
}

type RawEntry = {
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

type RawSession = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

const ENTRY_COLUMNS =
  "id, session_id, customer_name, customer_email, party_size, status, joined_at, offered_at, offer_expires_at";
const SESSION_COLUMNS = "id, title, starts_at, ends_at, status";

/** Run `work` over `items` a few at a time, so sixty seat reads are not sixty round trips in a row. */
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await work(items[index]!);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Read one session's seats through the engine.
 *
 * A pool that exists and a remaining that cannot be read are different
 * answers and stay different all the way to the screen.
 */
async function readSeats(
  admin: Admin,
  pool: { id: string; unitsTotal: number } | undefined,
  session: RawSession,
): Promise<WaitlistSeats> {
  if (!pool) return { kind: "uncounted" };
  const { data, error } = await admin.rpc("capacity_remaining_public", {
    p_pool_id: pool.id,
    p_starts_at: session.starts_at,
    p_ends_at: session.ends_at,
  });
  if (error) {
    logServerError("scheduling.waitlistDesk/remaining", error);
    return { kind: "unreadable", total: pool.unitsTotal };
  }
  if (typeof data !== "number") return { kind: "unreadable", total: pool.unitsTotal };
  return { kind: "counted", total: pool.unitsTotal, remaining: data };
}

/**
 * Every session this workspace should be looking at a queue for.
 *
 * Two sources, unioned: the sessions somebody is already waiting for, and the
 * upcoming sessions the engine says are full. The first can never be dropped;
 * the second is what makes the journey startable from nothing.
 */
export async function loadWaitlistDesk(
  admin: Admin,
  tenantId: string,
  now: Date,
  options: {
    /**
     * A session the operator asked for by name, from the Sessions view. It is
     * read whatever the cap or the horizon say, so that door can never lead to
     * a screen the class is missing from.
     */
    alwaysInclude?: string | null;
    /**
     * How many upcoming sessions to examine. Clamped to the cap, so no caller
     * can turn one screen into hundreds of seat reads; it exists so the
     * truncation branch can be EXERCISED rather than asserted about, by
     * `scripts/proof-appointments-journey.ts` against three real sessions.
     */
    candidateLimit?: number;
  } = {},
): Promise<WaitlistDeskResult> {
  const horizonIso = new Date(now.getTime() + WAITLIST_HORIZON_DAYS * 86_400_000).toISOString();
  const limit =
    typeof options.candidateLimit === "number" && Number.isFinite(options.candidateLimit)
      ? Math.max(1, Math.min(WAITLIST_CANDIDATE_LIMIT, Math.trunc(options.candidateLimit)))
      : WAITLIST_CANDIDATE_LIMIT;

  const [entryRead, candidateRead] = await Promise.all([
    admin
      .from("session_waitlist_entries")
      .select(ENTRY_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("joined_at", { ascending: true })
      .limit(500),
    admin
      .from("sessions")
      .select(SESSION_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("status", "scheduled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", horizonIso)
      .order("starts_at", { ascending: true })
      // One more than the cap, so "exactly at the cap" and "more than we
      // looked at" are different answers rather than the same number.
      .limit(limit + 1),
  ]);

  if (entryRead.error) {
    logServerError("scheduling.waitlistDesk/entries", entryRead.error);
    return { ok: false, error: GENERIC_LOAD_ERROR };
  }
  if (candidateRead.error) {
    logServerError("scheduling.waitlistDesk/candidates", candidateRead.error);
    return { ok: false, error: GENERIC_LOAD_ERROR };
  }

  const entries = (entryRead.data ?? []) as RawEntry[];
  const candidates = (candidateRead.data ?? []) as RawSession[];
  const truncated = candidates.length > limit;
  const sessionsById = new Map<string, RawSession>();
  for (const row of candidates.slice(0, limit)) sessionsById.set(row.id, row);

  // The sessions behind the queue, whatever their status or date. Somebody
  // waiting for a class that was cancelled, or one further out than the
  // horizon, must still see their own row rather than have it vanish. Plus the
  // one the operator arrived here for.
  const asked = options.alwaysInclude?.trim() || null;
  const queuedIds = [
    ...new Set([...entries.map((e) => e.session_id), ...(asked ? [asked] : [])]),
  ].filter((id) => !sessionsById.has(id));
  if (queuedIds.length > 0) {
    const { data, error } = await admin
      .from("sessions")
      .select(SESSION_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("id", queuedIds);
    if (error) {
      logServerError("scheduling.waitlistDesk/queuedSessions", error);
      return { ok: false, error: GENERIC_LOAD_ERROR };
    }
    for (const row of (data ?? []) as RawSession[]) sessionsById.set(row.id, row);
  }

  const sessions = [...sessionsById.values()];
  if (sessions.length === 0) {
    return {
      ok: true,
      sessions: [],
      unreadableSessions: 0,
      truncated,
      checkedAhead: limit,
    };
  }

  const { data: poolData, error: poolErr } = await admin
    .from("capacity_pools")
    .select("id, subject_id, units_total")
    .eq("tenant_id", tenantId)
    .eq("subject_kind", "session_tier")
    .in(
      "subject_id",
      sessions.map((s) => s.id),
    );
  if (poolErr) {
    logServerError("scheduling.waitlistDesk/pools", poolErr);
    return { ok: false, error: GENERIC_LOAD_ERROR };
  }
  const pools = new Map<string, { id: string; unitsTotal: number }>();
  for (const p of (poolData ?? []) as Array<{
    id: string;
    subject_id: string;
    units_total: number;
  }>) {
    pools.set(p.subject_id, { id: p.id, unitsTotal: Number(p.units_total) });
  }

  const seatsPerSession = await mapWithLimit(sessions, REMAINING_CONCURRENCY, (session) =>
    readSeats(admin, pools.get(session.id), session),
  );

  const views: WaitlistView[] = [];
  let unreadableSessions = 0;
  sessions.forEach((session, index) => {
    const mine = entries.filter((e) => e.session_id === session.id);
    const seats = seatsPerSession[index]!;
    // The session an operator explicitly opened is shown whatever its seats
    // say. They came here to put somebody on its list; answering with a screen
    // it is missing from is the dead end this whole change removes.
    const belongs =
      session.id === asked || belongsOnWaitlistDesk({ hasEntries: mine.length > 0, seats });
    if (!belongs) {
      if (seats.kind === "unreadable") unreadableSessions += 1;
      return;
    }
    const ordered = orderWaitlist(mine, now);
    views.push({
      sessionId: session.id,
      sessionTitle: session.title?.trim() || "Untitled session",
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      seats,
      entries: ordered,
      nextInLineId: nextInLine(ordered, now)?.id ?? null,
    });
  });

  views.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return {
    ok: true,
    sessions: views,
    unreadableSessions,
    truncated,
    checkedAhead: limit,
  };
}

/* ── joining ───────────────────────────────────────────────────────────────── */

export type JoinWaitlistRefusalKey =
  | "nameRequired"
  | "alreadyWaiting"
  | "seatsAvailable"
  | "noSeatsSet"
  | "notFound"
  | "sessionNotOpen"
  | "unavailable";

export type JoinWaitlistResult =
  | { ok: true; entryId: string }
  | {
      ok: false;
      refusalKey: JoinWaitlistRefusalKey;
      /** Present on `seatsAvailable`, so the sentence can say how many are free. */
      seatsRemaining: number | null;
    };

function refuseJoin(
  refusalKey: JoinWaitlistRefusalKey,
  seatsRemaining: number | null = null,
): JoinWaitlistResult {
  return { ok: false, refusalKey, seatsRemaining };
}

/**
 * Put somebody on the queue for a full session (K02, the refusal branch of a
 * class enrollment).
 *
 * FOUR REFUSALS, EACH OF THEM A KINDNESS.
 *   - a blank name, because a place cannot later be offered to somebody nobody
 *     can call;
 *   - a session that still has seats, because the answer there is to book them
 *     in, not to start a queue;
 *   - a session whose seats were never set, because `promote` refuses that
 *     shape with `no_pool` and a queue nothing can ever promote from is a
 *     dead end dressed as progress;
 *   - a session that is not on sale, for the same reason: it has no place to
 *     give and never will while it is in that state.
 */
export async function joinWaitlist(
  admin: Admin,
  input: {
    tenantId: string;
    sessionId: string;
    customerName: string;
    customerEmail: string | null;
  },
): Promise<JoinWaitlistResult> {
  const name = input.customerName.trim();
  if (!name) return refuseJoin("nameRequired");
  if (!input.tenantId || !input.sessionId) return refuseJoin("notFound");

  const { data: sessionRow, error: sessionErr } = await admin
    .from("sessions")
    .select("id, starts_at, ends_at, status")
    .eq("id", input.sessionId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (sessionErr) {
    logServerError("scheduling.joinWaitlist/session", sessionErr);
    return refuseJoin("unavailable");
  }
  const session = sessionRow as RawSession | null;
  if (!session) return refuseJoin("notFound");
  if (session.status !== "scheduled") return refuseJoin("sessionNotOpen");

  const { data: poolRow, error: poolErr } = await admin
    .from("capacity_pools")
    .select("id, units_total")
    .eq("tenant_id", input.tenantId)
    .eq("subject_kind", "session_tier")
    .eq("subject_id", session.id)
    .maybeSingle();
  if (poolErr) {
    logServerError("scheduling.joinWaitlist/pool", poolErr);
    return refuseJoin("unavailable");
  }
  const pool = poolRow as { id: string; units_total: number } | null;
  if (!pool) return refuseJoin("noSeatsSet");

  const seats = await readSeats(
    admin,
    { id: pool.id, unitsTotal: Number(pool.units_total) },
    session,
  );
  // An unreadable count is not a free seat and not a full class. Refusing here
  // rather than queueing anyway keeps the one promise this list makes: nobody
  // is on it who should simply have been sold a place.
  if (seats.kind !== "counted") return refuseJoin("unavailable");
  if (seats.remaining > 0) return refuseJoin("seatsAvailable", seats.remaining);

  const email = input.customerEmail?.trim() || null;
  const { data: inserted, error: insertErr } = await admin
    .from("session_waitlist_entries")
    .insert({
      tenant_id: input.tenantId,
      session_id: session.id,
      customer_name: name,
      customer_email: email,
    })
    .select("id")
    .maybeSingle();
  if (insertErr) {
    // 23505 is the partial unique index on (session, email) for live entries.
    // It is deliberately NOT an ON CONFLICT target — a partial unique index
    // cannot serve as an inference specification — so it is read here instead.
    if ((insertErr as { code?: string }).code === "23505") return refuseJoin("alreadyWaiting");
    logServerError("scheduling.joinWaitlist/insert", insertErr);
    return refuseJoin("unavailable");
  }

  const entryId = (inserted as { id: string } | null)?.id ?? "";
  if (!entryId) {
    // The insert reported no error and gave back no row. Saying "added" here
    // would put a name on a screen that is not in the table.
    logServerError("scheduling.joinWaitlist/insert", new Error("insert returned no row"));
    return refuseJoin("unavailable");
  }
  return { ok: true, entryId };
}
