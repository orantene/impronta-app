import type { SupabaseClient } from "@supabase/supabase-js";

import {
  anonymizeUserData,
  firstFailure,
  loadAnonymizeSubject,
  type AnonymizeReport,
  type AnonymizeSubject,
} from "./anonymize";

/**
 * Self-serve account deletion (legal plan 3.1): grace period, blockers and the
 * executor state machine. The executor's decisions are pure functions over
 * injected deps so they are unit-tested without a database.
 */

export const DELETION_GRACE_DAYS = 14;
export const DELETION_TABLE = "account_deletion_requests";

/** Typed confirmation. Either language's word is accepted. */
export const DELETION_CONFIRM_WORDS = ["DELETE", "ELIMINAR"] as const;
export function isDeletionConfirmation(typed: string): boolean {
  const v = typed.trim().toUpperCase();
  return (DELETION_CONFIRM_WORDS as readonly string[]).includes(v);
}

export type DeletionSurface = "talent" | "client" | "workspace" | "admin";
export type DeletionStatus = "pending" | "blocked" | "processing" | "completed" | "cancelled" | "failed";
export const OPEN_DELETION_STATUSES: DeletionStatus[] = ["pending", "blocked", "processing", "failed"];
/** Statuses the executor will pick up (processing = claimed by a live run). */
export const EXECUTABLE_DELETION_STATUSES: DeletionStatus[] = ["pending", "blocked", "failed"];

export type BlockerCode =
  | "future_booking"
  | "payout_pending"
  | "balance_on_account"
  | "balance_owed"
  | "workspace_has_team";

export type DeletionBlocker = { code: BlockerCode; count: number };

/** Raw counts gathered from the database; the decision is pure. */
export type BlockerSnapshot = {
  /** Open (tentative/confirmed/in progress) bookings dated today or later, or undated. */
  futureBookings: number;
  /** booking_payouts legs still held or failed for the user's talent profiles. */
  pendingPayouts: number;
  /** Money the client has on deposit with a workspace (client_trust_state). */
  fundedBalanceCents: number;
  /** Bookings where the user is the client and only a deposit was paid. */
  partiallyPaidBookings: number;
  /** Workspaces the user owns that still have other active members. */
  teamWorkspaces: number;
};

export function deriveBlockers(s: BlockerSnapshot): DeletionBlocker[] {
  const out: DeletionBlocker[] = [];
  if (s.futureBookings > 0) out.push({ code: "future_booking", count: s.futureBookings });
  if (s.pendingPayouts > 0) out.push({ code: "payout_pending", count: s.pendingPayouts });
  if (s.fundedBalanceCents > 0) out.push({ code: "balance_on_account", count: 1 });
  if (s.partiallyPaidBookings > 0) out.push({ code: "balance_owed", count: s.partiallyPaidBookings });
  if (s.teamWorkspaces > 0) out.push({ code: "workspace_has_team", count: s.teamWorkspaces });
  return out;
}

export function scheduledForFrom(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

const OPEN_BOOKING_STATUSES = ["tentative", "confirmed", "in_progress"];

function countOf(res: { count: number | null; error: { message: string } | null }, label: string): number {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.count ?? 0;
}

/**
 * Gather the blocker snapshot. Throws on any read failure: a blocker check
 * that could not read must never be mistaken for "no blockers".
 */
export async function loadBlockerSnapshot(
  admin: SupabaseClient,
  userId: string,
  talentProfileIds: string[],
  now: Date = new Date(),
): Promise<BlockerSnapshot> {
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const futureOr = `starts_at.gte.${nowIso},event_date.gte.${today},and(starts_at.is.null,event_date.is.null)`;

  // Bookings where they are the talent.
  let talentBookingIds: string[] = [];
  if (talentProfileIds.length > 0) {
    const { data, error } = await admin
      .from("booking_talent")
      .select("booking_id")
      .in("talent_profile_id", talentProfileIds);
    if (error) throw new Error(`booking_talent: ${error.message}`);
    talentBookingIds = Array.from(new Set(((data ?? []) as Array<{ booking_id: string }>).map((r) => r.booking_id)));
  }

  const asClient = countOf(
    await admin
      .from("agency_bookings")
      .select("id", { count: "exact", head: true })
      .eq("client_user_id", userId)
      .in("status", OPEN_BOOKING_STATUSES)
      .or(futureOr),
    "agency_bookings.client",
  );
  let asTalent = 0;
  for (let i = 0; i < talentBookingIds.length; i += 200) {
    asTalent += countOf(
      await admin
        .from("agency_bookings")
        .select("id", { count: "exact", head: true })
        .in("id", talentBookingIds.slice(i, i + 200))
        .in("status", OPEN_BOOKING_STATUSES)
        .or(futureOr),
      "agency_bookings.talent",
    );
  }

  const pendingPayouts =
    talentProfileIds.length > 0
      ? countOf(
          await admin
            .from("booking_payouts")
            .select("id", { count: "exact", head: true })
            .in("talent_profile_id", talentProfileIds)
            .in("status", ["held", "failed"]),
          "booking_payouts",
        )
      : 0;

  const { data: trust, error: trustErr } = await admin
    .from("client_trust_state")
    .select("funded_balance_cents")
    .eq("user_id", userId);
  if (trustErr) throw new Error(`client_trust_state: ${trustErr.message}`);
  const fundedBalanceCents = ((trust ?? []) as Array<{ funded_balance_cents: number | null }>).reduce(
    (sum, r) => sum + Math.max(0, r.funded_balance_cents ?? 0),
    0,
  );

  const partiallyPaidBookings = countOf(
    await admin
      .from("agency_bookings")
      .select("id", { count: "exact", head: true })
      .eq("client_user_id", userId)
      .eq("payment_status", "partial")
      .not("status", "in", "(cancelled,archived,draft)"),
    "agency_bookings.partial",
  );

  const { data: owned, error: ownErr } = await admin
    .from("agency_memberships")
    .select("tenant_id")
    .eq("profile_id", userId)
    .eq("role", "owner")
    .eq("status", "active");
  if (ownErr) throw new Error(`agency_memberships.owner: ${ownErr.message}`);
  let teamWorkspaces = 0;
  for (const row of (owned ?? []) as Array<{ tenant_id: string }>) {
    const others = countOf(
      await admin
        .from("agency_memberships")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", row.tenant_id)
        .eq("status", "active")
        .neq("profile_id", userId),
      "agency_memberships.team",
    );
    if (others > 0) teamWorkspaces += 1;
  }

  return {
    futureBookings: asClient + asTalent,
    pendingPayouts,
    fundedBalanceCents,
    partiallyPaidBookings,
    teamWorkspaces,
  };
}

// ─── executor ────────────────────────────────────────────────────────────────

export type DeletionRequestRow = {
  id: string;
  user_id: string;
  status: DeletionStatus;
  scheduled_for: string;
  attempt_count: number;
  last_attempt_at?: string | null;
};

/** A run that claimed a request and then died leaves it in processing. */
export const STALE_PROCESSING_MS = 60 * 60 * 1000;

export function isExecutable(req: DeletionRequestRow, now: Date): boolean {
  if ((EXECUTABLE_DELETION_STATUSES as string[]).includes(req.status)) return true;
  if (req.status !== "processing") return false;
  const last = req.last_attempt_at ? new Date(req.last_attempt_at).getTime() : 0;
  return now.getTime() - last > STALE_PROCESSING_MS;
}

export type ExecutionOutcome =
  | { kind: "skipped"; reason: "not_due" | "not_claimed" }
  | { kind: "blocked"; blockers: DeletionBlocker[] }
  | { kind: "completed"; alreadyGone: boolean }
  | { kind: "failed"; error: string };

export type ExecutorDeps = {
  /** Atomically move the request to processing; false if another run or a cancel won. */
  claim(req: DeletionRequestRow, now: Date): Promise<boolean>;
  loadSubject(userId: string): Promise<{ subject: AnonymizeSubject; authUserExists: boolean }>;
  loadBlockers(subject: AnonymizeSubject, now: Date): Promise<DeletionBlocker[]>;
  anonymize(subject: AnonymizeSubject, now: Date): Promise<AnonymizeReport>;
  deleteAuthUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }>;
  finish(
    req: DeletionRequestRow,
    patch: { status: DeletionStatus; blockers?: DeletionBlocker[]; last_error?: string | null; completed_at?: string },
  ): Promise<void>;
};

/**
 * One request through the state machine. Order matters:
 *   claim → (auth user already gone? complete) → blockers → anonymize → delete auth → complete.
 * Anonymization runs while the auth user still exists, because deleting it
 * SET NULLs sender/client ids and the scrub could no longer find the rows.
 * Any failure leaves status = failed and the next run retries from the top;
 * every step is idempotent.
 */
export async function executeDeletionRequest(
  req: DeletionRequestRow,
  deps: ExecutorDeps,
  now: Date,
): Promise<ExecutionOutcome> {
  if (new Date(req.scheduled_for).getTime() > now.getTime()) return { kind: "skipped", reason: "not_due" };
  if (!isExecutable(req, now)) return { kind: "skipped", reason: "not_claimed" };
  if (!(await deps.claim(req, now))) return { kind: "skipped", reason: "not_claimed" };

  try {
    const { subject, authUserExists } = await deps.loadSubject(req.user_id);
    if (!authUserExists) {
      // A previous run deleted the auth user and then failed to record it.
      await deps.finish(req, { status: "completed", blockers: [], last_error: null, completed_at: now.toISOString() });
      return { kind: "completed", alreadyGone: true };
    }

    const blockers = await deps.loadBlockers(subject, now);
    if (blockers.length > 0) {
      await deps.finish(req, { status: "blocked", blockers, last_error: null });
      return { kind: "blocked", blockers };
    }

    const report = await deps.anonymize(subject, now);
    const failure = firstFailure(report);
    if (failure) {
      await deps.finish(req, { status: "failed", last_error: failure.slice(0, 500) });
      return { kind: "failed", error: failure };
    }

    const del = await deps.deleteAuthUser(req.user_id);
    if (!del.ok) {
      await deps.finish(req, { status: "failed", last_error: `auth.delete: ${del.error}`.slice(0, 500) });
      return { kind: "failed", error: del.error };
    }

    await deps.finish(req, { status: "completed", blockers: [], last_error: null, completed_at: now.toISOString() });
    return { kind: "completed", alreadyGone: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await deps.finish(req, { status: "failed", last_error: msg.slice(0, 500) });
    } catch {
      // Left in processing; the stale-processing rule retries it next run.
    }
    return { kind: "failed", error: msg };
  }
}

function isNotFound(message: string): boolean {
  return /not.?found/i.test(message);
}

export function createExecutorDeps(admin: SupabaseClient): ExecutorDeps {
  return {
    async claim(req, now) {
      let q = admin
        .from(DELETION_TABLE)
        .update({
          status: "processing",
          attempt_count: (req.attempt_count ?? 0) + 1,
          last_attempt_at: now.toISOString(),
        })
        .eq("id", req.id)
        .eq("status", req.status);
      // Re-claiming a stale run: only the run that saw the same stamp wins.
      if (req.status === "processing" && req.last_attempt_at) q = q.eq("last_attempt_at", req.last_attempt_at);
      const { data, error } = await q.select("id");
      if (error) throw new Error(`claim: ${error.message}`);
      return (data ?? []).length === 1;
    },
    async loadSubject(userId) {
      const res = await loadAnonymizeSubject(admin, userId);
      if (!res.ok) throw new Error(res.error);
      return { subject: res.subject, authUserExists: res.authUserExists };
    },
    async loadBlockers(subject, now) {
      return deriveBlockers(await loadBlockerSnapshot(admin, subject.userId, subject.talentProfileIds, now));
    },
    anonymize(subject, now) {
      return anonymizeUserData(
        admin,
        subject,
        { hideTalentProfiles: true, removeRosterRows: true, releaseCoordinatorSeats: true },
        now,
      );
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && !isNotFound(error.message)) return { ok: false, error: error.message };
      return { ok: true };
    },
    async finish(req, patch) {
      const { error } = await admin.from(DELETION_TABLE).update(patch).eq("id", req.id);
      if (error) throw new Error(`finish: ${error.message}`);
    },
  };
}

export async function listDueDeletionRequests(
  admin: SupabaseClient,
  now: Date,
  limit: number,
): Promise<DeletionRequestRow[]> {
  const { data, error } = await admin
    .from(DELETION_TABLE)
    .select("id, user_id, status, scheduled_for, attempt_count, last_attempt_at")
    .in("status", [...EXECUTABLE_DELETION_STATUSES, "processing"])
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`list due: ${error.message}`);
  return ((data ?? []) as DeletionRequestRow[]).filter((r) => isExecutable(r, now));
}
