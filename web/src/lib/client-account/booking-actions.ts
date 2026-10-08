"use server";

/**
 * Session-based cancel and reschedule for the `/account` page (TUL-62).
 *
 * MONEY-ADJACENT, KEPT SMALL. These two actions add ONE thing to the token flow
 * (`/manage/<token>`): the credential is the signed-in session instead of a
 * signed link. The decision of who may act is the pure `canManageBooking`
 * (owner, this tenant, a client account, still open and in the future). The
 * work itself is the SAME engine the token flow calls, untouched:
 * `cancelBookingSet` (refund intent, policy window) and `rescheduleBooking`
 * (`reschedule_booking_set` RPC: slot rules, allocations). Nothing about refunds
 * or availability is reimplemented here.
 *
 * The tenant comes from the proxy-set host header (`resolveAccountTenant`),
 * never from the browser. Ownership is `agency_bookings.client_user_id`.
 */

import { z } from "zod";

import { canManageBooking } from "@/lib/client-account/area-pure";
import { accountSurfaceEnabledForRequest, resolveAccountTenant } from "@/lib/client-account/tenant.server";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { cancelBookingSet } from "@/lib/scheduling/cancel-booking";
import { rescheduleBooking } from "@/lib/scheduling/reschedule-booking";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();
const opKey = z.string().min(8).max(80);

export type MyBookingRefusal =
  | "invalid"
  | "unavailable"
  | "not_signed_in"
  | "not_allowed"
  | "not_found"
  | "not_cancellable"
  | "not_reschedulable"
  | "slot_taken"
  | "conflict";

type Gate =
  | { ok: false; reason: MyBookingRefusal }
  | { ok: true; tenantId: string; userId: string; admin: NonNullable<ReturnType<typeof createServiceRoleClient>>; startsAt: string | null };

async function gate(bookingId: string): Promise<Gate> {
  if (!(await accountSurfaceEnabledForRequest())) return { ok: false, reason: "unavailable" };
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, reason: "not_signed_in" };
  const tenant = await resolveAccountTenant();
  const admin = createServiceRoleClient();
  if (!tenant || !admin) return { ok: false, reason: "unavailable" };
  // Scoped by tenant in the query as well as in the decision: another tenant's
  // booking is "not found", never a hint that it exists.
  const { data, error } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, client_user_id, status, starts_at")
    .eq("id", bookingId)
    .eq("tenant_id", tenant.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("clientAccount.booking.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_found" };
  const b = data as { tenant_id: string; client_user_id: string | null; status: string | null; starts_at: string | null };
  const decision = canManageBooking({
    sessionUserId: session.user.id,
    appRole: session.profile?.app_role ?? null,
    siteTenantId: tenant.tenantId,
    booking: { bookingTenantId: b.tenant_id, bookingClientUserId: b.client_user_id, bookingStatus: b.status, startsAt: b.starts_at },
    nowMs: Date.now(),
  });
  if (!decision.ok) {
    return { ok: false, reason: decision.reason === "not_signed_in" ? "not_signed_in" : decision.reason === "closed" || decision.reason === "past" ? "not_cancellable" : "not_allowed" };
  }
  return { ok: true, tenantId: tenant.tenantId, userId: session.user.id, admin, startsAt: b.starts_at };
}

export async function cancelMyBooking(input: {
  bookingId: string;
  operationKey: string;
  reason: string;
}): Promise<{ ok: true; refundableCents: number } | { ok: false; reason: MyBookingRefusal }> {
  const parsed = z.object({ bookingId: uuid, operationKey: opKey, reason: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const g = await gate(parsed.data.bookingId);
  if (!g.ok) return g;
  const result = await cancelBookingSet(g.admin, {
    tenantId: g.tenantId,
    bookingId: parsed.data.bookingId,
    operationKey: parsed.data.operationKey,
    reason: parsed.data.reason,
    by: "customer",
  });
  if (result.ok) return { ok: true, refundableCents: result.refundableCents };
  switch (result.reason) {
    case "not_cancellable":
    case "policy_keeps":
      return { ok: false, reason: "not_cancellable" };
    case "conflict":
    case "not_found":
    case "invalid":
      return { ok: false, reason: result.reason };
    default:
      return { ok: false, reason: "unavailable" };
  }
}

export async function rescheduleMyBooking(input: {
  bookingId: string;
  operationKey: string;
  newStartsAt: string;
}): Promise<{ ok: true; startsAt: string; endsAt: string } | { ok: false; reason: MyBookingRefusal }> {
  const parsed = z.object({ bookingId: uuid, operationKey: opKey, newStartsAt: z.string().min(10) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const g = await gate(parsed.data.bookingId);
  if (!g.ok) return g;
  const result = await rescheduleBooking(g.admin, {
    tenantId: g.tenantId,
    bookingId: parsed.data.bookingId,
    newStartsAt: parsed.data.newStartsAt,
    newEndsAt: null,
    // The signed-in client, so the audit line says who moved the booking.
    actorUserId: g.userId,
    operationKey: parsed.data.operationKey,
    expectedStartsAt: g.startsAt,
  });
  if (result.ok) return { ok: true, startsAt: result.startsAt, endsAt: result.endsAt };
  switch (result.reason) {
    case "not_reschedulable":
    case "conflict":
    case "not_found":
    case "invalid":
      return { ok: false, reason: result.reason };
    case "slot_taken":
    case "sold_out":
    case "ancestor_full":
      return { ok: false, reason: "slot_taken" };
    default:
      return { ok: false, reason: "unavailable" };
  }
}
