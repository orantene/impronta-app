import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

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
    return { ok: true };
  } catch (err) {
    logServerError("projects.setOwnConfirmation", err);
    return { ok: false, reason: "unavailable" };
  }
}
