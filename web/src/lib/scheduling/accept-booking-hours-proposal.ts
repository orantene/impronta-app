/**
 * Accept path for a booking-hours proposal (T1-07).
 *
 * Split out of `src/lib/server-actions/booking-hours.ts` so the RPC call and
 * the refusal-reason-to-message mapping can be exercised directly in the
 * test:scheduling lane, without going through the "use server" wrapper's
 * session/auth plumbing (getCachedActorSession, requireWorkspaceStaffAction,
 * next/cache). The database function `accept_booking_hours_proposal` has its
 * own proof block, but that proof runs once, at migration-apply time, inside
 * a transaction it rolls into COMMIT — it can never catch a regression here,
 * in the TypeScript that decides what an operator actually reads on screen
 * when the RPC refuses.
 *
 * The two refusals this task cares about:
 *   - hours_exist: a deliberate calendar is already there; the proposal
 *     must never overwrite it.
 *   - timezone_required: neither the proposal nor the operator's override
 *     carries a timezone, so there is nothing honest to write.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { parseBookingHours, type BookingHours } from "@/lib/scheduling/hours-types";

type RpcResult = { ok?: boolean; reason?: string; timezone?: string } | null;

/**
 * The message an operator sees for each refusal `reason` the RPC can return.
 * PURE — no DB, no I/O. Any reason not listed (including a future one the
 * database starts returning) falls back to the generic update-failed copy,
 * never a raw SQL reason leaking onto the screen.
 */
export function messageForAcceptRefusal(reason: string | undefined, genericError: string): string {
  switch (reason) {
    case "hours_exist":
      return "This person already has booking hours.";
    case "timezone_required":
    case "bad_input":
      return "Pick a time zone.";
    case "not_found":
      return "That proposal is no longer there.";
    default:
      return genericError;
  }
}

export type AcceptBookingHoursProposalResult =
  | { ok: true; hours: BookingHours }
  | { ok: false; error: string };

/**
 * Calls the `accept_booking_hours_proposal` RPC and, on success, reloads the
 * written row. Callers (the server action) are responsible for auth and for
 * validating the timezone shape before this runs — this function trusts its
 * inputs and only interprets the RPC's own refusal.
 */
export async function acceptBookingHoursProposalCore(
  admin: Pick<SupabaseClient, "rpc" | "from">,
  input: {
    talentProfileId: string;
    actorId: string;
    timezone: string;
  },
  genericError: string,
): Promise<AcceptBookingHoursProposalResult> {
  const { data, error } = await admin.rpc("accept_booking_hours_proposal", {
    p_talent_profile_id: input.talentProfileId,
    p_actor_id: input.actorId,
    p_overrides: { timezone: input.timezone },
  });
  if (error) {
    logServerError("booking-hours.acceptProposal", error);
    return { ok: false, error: genericError };
  }

  const result = data as RpcResult;
  if (!result?.ok) {
    return { ok: false, error: messageForAcceptRefusal(result?.reason, genericError) };
  }

  const { data: hoursRow, error: hoursErr } = await admin
    .from("talent_booking_hours")
    .select(
      "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
    )
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (hoursErr) {
    logServerError("booking-hours.acceptProposal/reload", hoursErr);
    return { ok: false, error: genericError };
  }
  const hours = parseBookingHours(hoursRow);
  if (!hours) return { ok: false, error: genericError };

  return { ok: true, hours };
}
