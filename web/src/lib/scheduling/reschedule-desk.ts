/**
 * reschedule-desk.ts — the move, and the refusal with a name in it.
 *
 * SPLIT OUT OF THE ACTION FOR ONE REASON: an export of a `"use server"` module
 * can only ever be reached by a signed-in browser request, so nothing in this
 * path could be driven by a script and nothing in it ever was. It takes the
 * admin client as an argument; `rescheduleAppointment` proves the caller is
 * staff of the tenant, calls this, and then writes the audit line.
 * `scripts/proof-appointments-journey.ts` calls THIS against the isolated
 * database, so what is proven and what the screen runs are one function.
 *
 * WHAT IT ADDS OVER `rescheduleBooking`. That returns `failed_talent_id` and
 * `failed_pool_id`, two uuids. `rescheduleBookingAction` in
 * `_pipeline-actions.ts` drops both, because its flat `{ ok, error }` shape has
 * nowhere to put them, so an operator reads "that time is already booked" and
 * cannot tell who to ask. This resolves each to a NAME and hands back a
 * refusal key plus its parameters.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { rescheduleBooking } from "@/lib/scheduling/reschedule-booking";
import {
  describeRescheduleRefusal,
  type RescheduleRefusal,
} from "@/lib/scheduling/reschedule-refusal";
import { nameForPool, nameForTalent } from "@/lib/scheduling/appointments-lookups";

type Admin = Pick<SupabaseClient, "from" | "rpc">;

export type RescheduleDeskResult =
  | {
      ok: true;
      already: boolean;
      previous: { startsAt: string | null; endsAt: string | null };
      startsAt: string;
      endsAt: string;
    }
  | { ok: false; refusal: RescheduleRefusal };

export type RescheduleDeskInput = {
  tenantId: string;
  bookingId: string;
  newStartsAt: string;
  newEndsAt: string | null;
  actorUserId: string;
  /**
   * The window the OPERATOR WAS LOOKING AT. Passing it is the whole point:
   * without it the RPC keeps its last-write-wins behaviour and a stale screen
   * silently overwrites somebody else's move. With it, a stale screen is
   * refused with `conflict`.
   */
  expectedStartsAt: string | null;
  expectedEndsAt: string | null;
};

/** Move a booking, or refuse with a sentence that names what stood in the way. */
export async function rescheduleWithNames(
  admin: Admin,
  input: RescheduleDeskInput,
): Promise<RescheduleDeskResult> {
  const moved = await rescheduleBooking(admin, {
    tenantId: input.tenantId,
    bookingId: input.bookingId,
    newStartsAt: input.newStartsAt,
    newEndsAt: input.newEndsAt,
    actorUserId: input.actorUserId,
    expectedStartsAt: input.expectedStartsAt,
    expectedEndsAt: input.expectedEndsAt,
  });

  if (!moved.ok) {
    const [personName, spaceName] = await Promise.all([
      nameForTalent(admin, moved.failedTalentId),
      nameForPool(admin, input.tenantId, moved.failedPoolId),
    ]);
    return {
      ok: false,
      refusal: describeRescheduleRefusal({ reason: moved.reason, personName, spaceName }),
    };
  }

  return {
    ok: true,
    already: moved.already,
    previous: moved.previous,
    startsAt: moved.startsAt,
    endsAt: moved.endsAt,
  };
}
