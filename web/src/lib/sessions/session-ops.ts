import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { assertUserIsTenantStaff } from "@/lib/supabase/tenant-owned-ids";
import { releaseResourcesOfCancelledSessions } from "@/lib/resources/session-resource-holds";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from?: (table: string) => any;
};

export type SessionOpsReason =
  | "sold_out"
  | "already_cancelled"
  | "paid_seats_need_refund"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "invalid"
  | "unavailable"
  | "room_release_failed";

function mapReason(raw: string | undefined, allowed: SessionOpsReason[]): SessionOpsReason {
  if (raw && (allowed as string[]).includes(raw)) return raw as SessionOpsReason;
  return "unavailable";
}

export async function sessionSetInstructor(
  admin: Admin,
  input: { tenantId: string; sessionId: string; userId: string; scope: "this" | "future" | "series" },
): Promise<{ ok: true; updated: number } | { ok: false; reason: SessionOpsReason }> {
  if (typeof admin.rpc !== "function" || typeof admin.from !== "function") return { ok: false, reason: "unavailable" };
  // TUL-1517: the RPC takes the instructor id as given. It must be staff of THIS tenant.
  const ownedInstructor = await assertUserIsTenantStaff(admin as Parameters<typeof assertUserIsTenantStaff>[0], input.userId, input.tenantId);
  if (!ownedInstructor.ok) return { ok: false, reason: ownedInstructor.reason === "unavailable" ? "unavailable" : "wrong_tenant" };
  const { data, error } = await admin.rpc("session_set_instructor", {
    p_tenant_id: input.tenantId,
    p_session_id: input.sessionId,
    p_user_id: input.userId,
    p_scope: input.scope,
  });
  if (error) {
    logServerError("sessions.sessionSetInstructor", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; updated?: number };
  if (reply.ok === true) return { ok: true, updated: Number(reply.updated) || 0 };
  return { ok: false, reason: mapReason(reply.reason, ["already_cancelled", "not_found", "invalid"]) };
}

export async function sessionMoveParticipant(
  admin: Admin,
  input: { tenantId: string; admissionId: string; toSessionId: string; operationKey: string },
): Promise<
  | { ok: true; admissionId: string; allocationId: string | null; already?: boolean }
  | { ok: false; reason: SessionOpsReason }
> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("session_move_participant", {
    p_tenant_id: input.tenantId,
    p_admission_id: input.admissionId,
    p_to_session_id: input.toSessionId,
    p_operation_key: input.operationKey.trim(),
  });
  if (error) {
    logServerError("sessions.sessionMoveParticipant", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    already?: boolean;
    admission_id?: string;
    allocation_id?: string | null;
  };
  if (reply.ok === true) {
    return {
      ok: true,
      admissionId: reply.admission_id ?? input.admissionId,
      allocationId: reply.allocation_id ?? null,
      already: reply.already === true,
    };
  }
  return {
    ok: false,
    reason: mapReason(reply.reason, ["sold_out", "already_cancelled", "conflict", "not_found", "wrong_tenant", "invalid"]),
  };
}

/**
 * TUL-1413: a cancelled session gives its room back. The cancel RPC does not say which
 * sessions it cancelled (scope this / future / series), so the session and its series are
 * read back and every one now cancelled releases its hold. Releasing is idempotent. A
 * failure FAILS the cancel call (the caller is told to press cancel again; the DB cancel is
 * already done, so the retry's "already cancelled" answer releases the room first), and the
 * cron sweep (`sweepCancelledSessionRooms`) is the safety net, so a room is never held for
 * good.
 */
async function releaseRoomsAfterCancel(admin: Admin, tenantId: string, sessionId: string): Promise<boolean> {
  try {
    // No database client to read with (a bare test double): nothing to release.
    if (typeof admin.from !== "function") return true;
    const from = (table: string) => admin.from!(table);
    const { data: base, error } = await from("sessions").select("id, series_id, status").eq("tenant_id", tenantId).eq("id", sessionId).maybeSingle();
    if (error || !base) {
      if (error) logServerError("sessions.sessionCancel.rooms/base", error);
      return false;
    }
    const b = base as { id: string; series_id: string | null; status: string };
    let candidates: Array<{ id: string; status: string }> = [{ id: b.id, status: b.status }];
    if (b.series_id) {
      const { data: rows, error: seriesErr } = await from("sessions").select("id, status").eq("tenant_id", tenantId).eq("series_id", b.series_id).eq("status", "cancelled").limit(1000);
      if (seriesErr) {
        logServerError("sessions.sessionCancel.rooms/series", seriesErr);
        return false;
      }
      candidates = [...candidates, ...((rows ?? []) as Array<{ id: string; status: string }>)];
    }
    const seen = new Set<string>();
    candidates = candidates.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    const res = await releaseResourcesOfCancelledSessions({ admin: admin as never, tenantId, sessions: candidates });
    if (!res.ok) logServerError("sessions.sessionCancel.rooms/release", `session=${sessionId}`);
    return res.ok;
  } catch (err) {
    logServerError("sessions.sessionCancel.rooms", err);
    return false;
  }
}

export async function sessionCancel(
  admin: Admin,
  input: {
    tenantId: string;
    sessionId: string;
    scope: "this" | "future" | "series";
    reason: string;
    operationKey: string;
  },
): Promise<
  | {
      ok: true;
      sessionsCancelled: number;
      poolsDeactivated: number;
      admissionsVoided: number;
      refundIntents: number;
      paidSeatsNeedRefund: boolean;
    }
  | { ok: false; reason: SessionOpsReason }
> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("session_cancel", {
    p_tenant_id: input.tenantId,
    p_session_id: input.sessionId,
    p_scope: input.scope,
    p_reason: input.reason,
    p_operation_key: input.operationKey.trim(),
  });
  if (error) {
    logServerError("sessions.sessionCancel", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    sessions_cancelled?: number;
    pools_deactivated?: number;
    admissions_voided?: number;
    refund_intents?: number;
    paid_seats_need_refund?: boolean;
  };
  if (reply.ok === true) {
    // Fail the call, never swallow: the cancel is done in the database, the room is still held.
    if (!(await releaseRoomsAfterCancel(admin, input.tenantId, input.sessionId))) return { ok: false, reason: "room_release_failed" };
    return {
      ok: true,
      sessionsCancelled: Number(reply.sessions_cancelled) || 0,
      poolsDeactivated: Number(reply.pools_deactivated) || 0,
      admissionsVoided: Number(reply.admissions_voided) || 0,
      refundIntents: Number(reply.refund_intents) || 0,
      paidSeatsNeedRefund: reply.paid_seats_need_refund === true,
    };
  }
  if (reply.reason === "already_cancelled") {
    // A retry after a failed release lands here: heal the room, report the same answer.
    await releaseRoomsAfterCancel(admin, input.tenantId, input.sessionId);
  }
  return { ok: false, reason: mapReason(reply.reason, ["already_cancelled", "not_found", "invalid"]) };
}
