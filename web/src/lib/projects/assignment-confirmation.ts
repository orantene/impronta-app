import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isOrderShellBooking } from "./project-record";

/**
 * TUL-1603: each person's own answer to "are you on this job?". One row per
 * assignment seat (`booking_talent.id`) in `project_assignment_confirmations`
 * (held migration 20261231422500).
 *
 * Fail closed:
 *  - A missing table or column (42P01 / 42703 / PGRST205) means the migration
 *    has not run: "no state", the board shows nobody as confirmed.
 *  - Any other read error is "unknown": also never confirmed.
 *  - A person can only set THEIR OWN seat (the seat's profile must belong to the
 *    signed-in user); everyone else is refused and nothing is written.
 */

export type ConfirmationState = "confirmed" | "declined";

export type ConfirmationsRead =
  | { ok: true; byAssignment: Record<string, ConfirmationState>; talentByAssignment: Record<string, string> }
  | { ok: false; reason: "no_state" | "unknown" };

const TABLE = "project_assignment_confirmations";
const MISSING = new Set(["42P01", "42703", "PGRST205"]);

export function isMissingSchemaError(err: { code?: string } | null | undefined): boolean {
  return !!err?.code && MISSING.has(err.code);
}

export async function readConfirmations(
  admin: SupabaseClient,
  input: { tenantId: string; bookingId: string },
): Promise<ConfirmationsRead> {
  try {
    const { data, error } = await admin
      .from(TABLE)
      .select("booking_talent_id, status, talent_profile_id")
      .eq("tenant_id", input.tenantId)
      .eq("booking_id", input.bookingId);
    if (error) {
      if (isMissingSchemaError(error)) return { ok: false, reason: "no_state" };
      logServerError("projects.readConfirmations", error);
      return { ok: false, reason: "unknown" };
    }
    // The swap RPC re-points the SAME seat (booking_talent.id) to another person, so an answer is
    // only valid for the person who gave it: we keep who answered and the board compares it with
    // the seat's current person.
    const byAssignment: Record<string, ConfirmationState> = {};
    const talentByAssignment: Record<string, string> = {};
    for (const r of (data ?? []) as Array<{ booking_talent_id?: unknown; status?: unknown; talent_profile_id?: unknown }>) {
      if (typeof r.booking_talent_id !== "string" || typeof r.talent_profile_id !== "string") continue;
      if (r.status === "confirmed" || r.status === "declined") {
        byAssignment[r.booking_talent_id] = r.status;
        talentByAssignment[r.booking_talent_id] = r.talent_profile_id;
      }
    }
    return { ok: true, byAssignment, talentByAssignment };
  } catch (err) {
    logServerError("projects.readConfirmations", err);
    return { ok: false, reason: "unknown" };
  }
}

/** Page loader: no service client means unknown, which is never confirmed. */
export async function loadConfirmations(tenantId: string, bookingId: string): Promise<ConfirmationsRead> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unknown" };
  return readConfirmations(admin, { tenantId, bookingId });
}

export type OwnSeat = { assignmentId: string; roleLabel: string | null; status: "confirmed" | "declined" | "awaiting" };

/**
 * TUL-1606: the signed-in person's OWN seat on a booking, with their own answer. Only a seat whose
 * profile belongs to `userId` is returned; no seat (or any read problem) is `null`, so the UI
 * shows no buttons rather than buttons that cannot work. An answer given by someone else on the
 * same seat (before a replacement) does not count.
 */
export async function readOwnSeat(admin: SupabaseClient, input: { userId: string; bookingId: string }): Promise<OwnSeat | null> {
  if (!input.userId || !input.bookingId) return null;
  try {
    // Only a PROJECT booking carries this card: the same rule the Projects reader uses (not an order shell).
    const bk = await admin
      .from("agency_bookings")
      .select("order_id, source_inquiry_id, calendar_lane, title")
      .eq("id", input.bookingId)
      .maybeSingle();
    if (bk.error) {
      logServerError("projects.readOwnSeat.booking", bk.error);
      return null;
    }
    const b = bk.data as { order_id: string | null; source_inquiry_id: string | null; calendar_lane: string | null; title: string | null } | null;
    if (!b || isOrderShellBooking({ order_id: b.order_id ?? null, source_inquiry_id: b.source_inquiry_id ?? null, calendar_lane: b.calendar_lane ?? null, title: b.title })) return null;
    const mine = await admin.from("talent_profiles").select("id").eq("user_id", input.userId);
    if (mine.error) {
      logServerError("projects.readOwnSeat.profiles", mine.error);
      return null;
    }
    const ids = ((mine.data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return null;
    const seatRes = await admin
      .from("booking_talent")
      .select("id, talent_profile_id, role_label")
      .eq("booking_id", input.bookingId);
    if (seatRes.error) {
      logServerError("projects.readOwnSeat.seat", seatRes.error);
      return null;
    }
    const seat = ((seatRes.data ?? []) as Array<{ id: string; talent_profile_id: string | null; role_label: string | null }>).find(
      (s) => s.talent_profile_id && ids.includes(s.talent_profile_id),
    );
    if (!seat || !seat.talent_profile_id) return null;
    const ansRes = await admin.from(TABLE).select("status, talent_profile_id").eq("booking_talent_id", seat.id).maybeSingle();
    if (ansRes.error) {
      // Table missing (migration not applied): no card, since every click would fail. Any other error: fail closed too.
      if (!isMissingSchemaError(ansRes.error)) logServerError("projects.readOwnSeat.answer", ansRes.error);
      return null;
    }
    const ans = ansRes.data as { status?: unknown; talent_profile_id?: unknown } | null;
    const status =
      ans && ans.talent_profile_id === seat.talent_profile_id && (ans.status === "confirmed" || ans.status === "declined") ? ans.status : "awaiting";
    return { assignmentId: seat.id, roleLabel: seat.role_label, status };
  } catch (err) {
    logServerError("projects.readOwnSeat", err);
    return null;
  }
}

export type SetConfirmationResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "not_yours" | "unavailable" };

export async function setOwnConfirmation(
  admin: SupabaseClient,
  input: { userId: string; assignmentId: string; status: ConfirmationState },
): Promise<SetConfirmationResult> {
  if (input.status !== "confirmed" && input.status !== "declined") return { ok: false, reason: "invalid" };
  if (!input.userId || !input.assignmentId) return { ok: false, reason: "invalid" };
  try {
    const seatRes = await admin
      .from("booking_talent")
      .select("id, tenant_id, booking_id, talent_profile_id")
      .eq("id", input.assignmentId)
      .maybeSingle();
    if (seatRes.error) {
      logServerError("projects.setOwnConfirmation.seat", seatRes.error);
      return { ok: false, reason: "unavailable" };
    }
    const seat = seatRes.data as { id: string; tenant_id: string; booking_id: string; talent_profile_id: string | null } | null;
    if (!seat || !seat.talent_profile_id) return { ok: false, reason: "not_yours" };

    // The seat's person must be a profile owned by the signed-in user.
    const ownRes = await admin
      .from("talent_profiles")
      .select("id")
      .eq("id", seat.talent_profile_id)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (ownRes.error) {
      logServerError("projects.setOwnConfirmation.owner", ownRes.error);
      return { ok: false, reason: "unavailable" };
    }
    if (!ownRes.data) return { ok: false, reason: "not_yours" };

    // Preferred: ONE guarded statement (held migration 20261231422700) that locks the seat and
    // writes only if the seat's CURRENT person is the writer, so a replaced person's late write
    // cannot overwrite the new person's answer.
    const rpc = await admin.rpc("answer_assignment_confirmation", {
      p_seat: seat.id,
      p_talent: seat.talent_profile_id,
      p_status: input.status,
    });
    if (!rpc.error) {
      return rpc.data === "ok" ? { ok: true } : { ok: false, reason: "not_yours" };
    }
    // Only a missing function falls back; any other error fails closed.
    if (rpc.error.code !== "PGRST202" && rpc.error.code !== "42883") {
      logServerError("projects.setOwnConfirmation.rpc", rpc.error);
      return { ok: false, reason: "unavailable" };
    }

    const { error } = await admin.from(TABLE).upsert(
      {
        tenant_id: seat.tenant_id,
        booking_id: seat.booking_id,
        booking_talent_id: seat.id,
        talent_profile_id: seat.talent_profile_id,
        status: input.status,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "booking_talent_id" },
    );
    if (error) {
      if (!isMissingSchemaError(error)) logServerError("projects.setOwnConfirmation.write", error);
      return { ok: false, reason: "unavailable" };
    }
    // Fallback only: re-check the seat after the write. If the person changed meanwhile, remove
    // the row we just wrote (conditioned on OUR profile, so a newer row by someone else stays).
    const after = await admin.from("booking_talent").select("talent_profile_id").eq("id", seat.id).maybeSingle();
    const still = (after.data as { talent_profile_id: string | null } | null)?.talent_profile_id;
    if (after.error || still !== seat.talent_profile_id) {
      const del = await admin.from(TABLE).delete().eq("booking_talent_id", seat.id).eq("talent_profile_id", seat.talent_profile_id);
      if (del.error) logServerError("projects.setOwnConfirmation.undo", del.error);
      return { ok: false, reason: after.error ? "unavailable" : "not_yours" };
    }
    return { ok: true };
  } catch (err) {
    logServerError("projects.setOwnConfirmation", err);
    return { ok: false, reason: "unavailable" };
  }
}
