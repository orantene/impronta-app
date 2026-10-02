import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readPolicyOverride } from "@/lib/bookings/policy-overrides";
import { logServerError } from "@/lib/server/safe-error";
import type { LateCancelRefund } from "@/lib/talent-policies/answers";
import { loadPublishedLateCancelRefund } from "@/lib/talent-policies/store";
import { loadEffectiveBookingPolicy } from "@/lib/talent/offering-policy-server";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/** The offering a booking was sold as: the first offering on its order's lines. */
export async function bookingOfferingId(admin: Admin, orderId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("order_lines")
    .select("offering_id")
    .eq("order_id", orderId)
    .not("offering_id", "is", null)
    .limit(1);
  if (error) {
    logServerError("scheduling.bookingOfferingId", error);
    return null;
  }
  const first = ((data ?? []) as Array<{ offering_id: string | null }>)[0];
  return first?.offering_id ?? null;
}

async function orderTotalCents(admin: Admin, orderId: string): Promise<number> {
  const { data, error } = await admin.from("order_lines").select("total_cents").eq("order_id", orderId);
  if (error) {
    logServerError("scheduling.bookingCancelPolicy.total", error);
    return 0;
  }
  return ((data ?? []) as Array<{ total_cents: number | null }>).reduce(
    (sum, l) => sum + (Number(l.total_cents) || 0),
    0,
  );
}

export type BookingCancelPolicy = {
  /** The free-cancel window in hours; null = flexible (nothing is kept). */
  cancelFreeHours: number | null;
  /** What happens to the deposit inside the window (published answer, else none). */
  lateCancelRefund: LateCancelRefund;
  /** The deposit portion of the order in cents, when a deposit % applies. */
  depositCents: number | null;
};

/**
 * THE one answer to "what cancel window and late-cancel rule does this booking
 * run under". The client manage link, the cancel engine and its refund amount
 * all read it, so the page, the promise and the money cannot disagree.
 *
 * Window precedence: a staff per-offering override
 * (`booking_policy_overrides.cancel_free_hours`, an explicit exception) wins;
 * otherwise the same chain the public booking sheet shows
 * (`resolveOfferingPolicy`: offering, talent default, platform 24 h).
 * Late-cancel rule: the PUBLISHED talent policy answer; unpublished edits never
 * move money.
 */
export async function loadBookingCancelPolicy(
  admin: Admin,
  input: { tenantId: string; orderId: string | null },
): Promise<BookingCancelPolicy> {
  const none: BookingCancelPolicy = { cancelFreeHours: null, lateCancelRefund: "none", depositCents: null };
  if (!input.orderId) return none;
  const offeringId = await bookingOfferingId(admin, input.orderId);
  if (!offeringId) return none;

  const override = await readPolicyOverride(admin, { tenantId: input.tenantId, offeringId });
  const effective = await loadEffectiveBookingPolicy(admin as unknown as SupabaseClient, offeringId);

  const overrideHours = override.ok ? (override.row?.cancelFreeHours ?? null) : null;
  const cancelFreeHours = overrideHours ?? effective?.cancellationHours ?? null;

  const lateCancelRefund = effective?.talentProfileId
    ? await loadPublishedLateCancelRefund(admin, effective.talentProfileId)
    : "none";

  let depositCents: number | null = null;
  if (effective?.depositPct != null) {
    const total = await orderTotalCents(admin, input.orderId);
    if (total > 0) depositCents = Math.round((total * effective.depositPct) / 100);
  }
  return { cancelFreeHours, lateCancelRefund, depositCents };
}
