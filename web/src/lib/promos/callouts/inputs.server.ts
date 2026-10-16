import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { logServerError } from "@/lib/server/safe-error";
import type { Promo } from "../types";
import type { CalloutInputs } from "./engine";
import {
  IDLE_WINDOW_DAYS, UPCOMING_DAYS, buildUpcomingDays, countLapsedClients, pickCancellation, serviceBookingCounts,
  type BookingSpan, type OrderStub,
} from "./inputs";

const DAY = 86_400_000;
const CONFIRMED_ORDER = ["paid", "fulfilled", "partially_refunded"];

type LineRow = { offering_id: string | null; orders: OrderStub & { status?: string } | (OrderStub & { status?: string })[] | null };

/**
 * Reads the talent's hours, bookings and orders and maps them to the callout
 * inputs. Any failed read leaves that input out (the callout simply cannot fire).
 */
export async function loadCalloutInputs(
  admin: SupabaseClient,
  scope: { talentId: string; tenantId: string },
  services: readonly { id: string; title: string }[],
  promos: readonly Promo[],
  now: Date,
): Promise<Omit<CalloutInputs, "now" | "state">> {
  const out: Omit<CalloutInputs, "now" | "state"> = {};
  const to = new Date(now.getTime() + (UPCOMING_DAYS + 1) * DAY).toISOString();
  const recent = new Date(now.getTime() - 3 * DAY).toISOString();

  const [hoursRes, upcomingRes, cancelledRes, pastRes, linesRes] = await Promise.all([
    admin.from("talent_booking_hours").select("timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days").eq("talent_profile_id", scope.talentId).maybeSingle(),
    admin.from("talent_bookings").select("starts_at, ends_at, status, updated_at").eq("talent_profile_id", scope.talentId).lt("starts_at", to).gt("ends_at", now.toISOString()).limit(500),
    admin.from("talent_bookings").select("starts_at, ends_at, status, updated_at").eq("talent_profile_id", scope.talentId).eq("status", "cancelled").gte("updated_at", recent).gt("starts_at", now.toISOString()).limit(50),
    admin.from("talent_bookings").select("id", { count: "exact", head: true }).eq("talent_profile_id", scope.talentId).neq("status", "cancelled").lt("starts_at", now.toISOString()),
    admin.from("order_lines").select("offering_id, orders!inner(customer_id, created_at, status)").eq("tenant_id", scope.tenantId).eq("talent_profile_id", scope.talentId).in("orders.status", CONFIRMED_ORDER).gte("created_at", new Date(now.getTime() - 400 * DAY).toISOString()).limit(2000),
  ]);

  if (hoursRes.error) logServerError("promos.callouts/hours", hoursRes.error);
  if (upcomingRes.error) logServerError("promos.callouts/upcoming", upcomingRes.error);
  if (cancelledRes.error) logServerError("promos.callouts/cancelled", cancelledRes.error);
  if (pastRes.error) logServerError("promos.callouts/past", pastRes.error);
  if (linesRes.error) logServerError("promos.callouts/lines", linesRes.error);

  const hours = hoursRes.error ? null : parseBookingHours(hoursRes.data);
  if (hours && !upcomingRes.error) {
    const days = buildUpcomingDays({ now, hours, busy: (upcomingRes.data ?? []) as BookingSpan[], promos });
    out.upcomingDays = days;
    out.hasAvailability = days.length > 0;
  }
  if (!pastRes.error) out.pastBookings = pastRes.count ?? 0;
  if (hours && !cancelledRes.error) {
    out.cancellation = pickCancellation({ now, hours, rows: (cancelledRes.data ?? []) as BookingSpan[] });
  }
  if (!linesRes.error) {
    const lines = ((linesRes.data ?? []) as unknown as LineRow[]).flatMap((l) => {
      const o = Array.isArray(l.orders) ? l.orders[0] : l.orders;
      return o ? [{ offering_id: l.offering_id, order: o }] : [];
    });
    out.lapsedClients = countLapsedClients(lines.map((l) => l.order), now);
    const since = now.getTime() - IDLE_WINDOW_DAYS * DAY;
    out.services = serviceBookingCounts(services, lines.filter((l) => Date.parse(l.order.created_at) >= since));
  }
  return out;
}
