import "server-only";

/**
 * load-me.ts — the tenant-scoped read behind `/me`.
 *
 * This is `client-hub/load-hub.ts` with the tenant filter PUT BACK. The hub
 * deliberately drops tenant scoping so a client sees every agency in one place;
 * `/me` on a tenant's own host is the opposite view, one tenant, so the filter
 * is the whole difference between them and it is not optional.
 *
 * OWNERSHIP AND TENANT ARE BOTH FILTERS, and neither substitutes for the other.
 * `client_user_id = userId` keeps it strictly the caller's own rows;
 * `tenant_id = tenantId` keeps it strictly this storefront's. A missing tenant
 * id returns EMPTY rather than falling back to "all tenants", because the
 * failure mode of a forgotten filter here is showing one customer another
 * tenant's history on a whitelabel domain.
 *
 * The error is CHECKED, never destructured away. A read whose failure is
 * indistinguishable from an empty result is how the seeded nav was empty for
 * every tenant since it shipped (#1532).
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { parseReservationStamp } from "@/lib/scheduling/reservation-intent";
import { EMPTY_ME, bookingOwnedInquiryIdsToAdd, meVisitListFields, shapeMeData, type MeData, type MeRow } from "./shape-me";

type BookingJoin = {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  starts_at?: string | null;
  total_client_revenue?: number | string | null;
  currency_code?: string | null;
  payment_status?: string | null;
};

type Row = {
  id: string;
  tenant_id: string;
  status: string | null;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  created_at: string;
  next_action_by: string | null;
  source_context?: unknown;
  agency_bookings: BookingJoin | BookingJoin[] | null;
};

/** `total_client_revenue` is a numeric column; normalise to integer cents. */
function toCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export async function loadMeData(
  userId: string,
  tenantId: string,
): Promise<MeData> {
  // Both are required. See the header: an absent tenant must not widen the
  // query, it must return nothing.
  if (!userId || !tenantId) return EMPTY_ME;

  try {
    const admin = createServiceRoleClient();
    if (!admin) return EMPTY_ME;

    const SELECT = `id, tenant_id, status, company, event_date, event_location, created_at, next_action_by, source_context,
         agency_bookings!agency_bookings_source_inquiry_id_fkey ( id, title, status, starts_at, total_client_revenue, currency_code, payment_status )`;
    const [{ data, error }, owned] = await Promise.all([
      admin
        .from("inquiries")
        .select(SELECT)
        .eq("client_user_id", userId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      // Bookings this client owns whose inquiry carries no client_user_id (see bookingOwnedInquiryIdsToAdd).
      admin
        .from("agency_bookings")
        .select("source_inquiry_id")
        .eq("client_user_id", userId)
        .eq("tenant_id", tenantId)
        .not("source_inquiry_id", "is", null)
        .limit(200),
    ]);

    if (error) {
      logServerError("me.loadMeData", error);
      return EMPTY_ME;
    }
    if (owned.error) logServerError("me.loadMeData.ownedBookings", owned.error);

    const rows = (data ?? []) as unknown as Row[];
    const extraIds = bookingOwnedInquiryIdsToAdd(
      ((owned.data ?? []) as Array<{ source_inquiry_id: string | null }>).map((b) => b.source_inquiry_id),
      rows.map((r) => r.id),
    );
    if (extraIds.length > 0) {
      const extra = await admin.from("inquiries").select(SELECT).in("id", extraIds).eq("tenant_id", tenantId);
      if (extra.error) logServerError("me.loadMeData.extraInquiries", extra.error);
      else rows.push(...((extra.data ?? []) as unknown as Row[]));
    }
    const mapped: MeRow[] = rows.map((r) => {
      const booking = Array.isArray(r.agency_bookings)
        ? r.agency_bookings[0]
        : r.agency_bookings;
      // TUL-62: same title / status / when preference as visit detail.
      const stamp = parseReservationStamp(r.source_context);
      const visit = meVisitListFields({
        stamp: stamp ? { starts_at: stamp.starts_at, timezone: stamp.timezone } : null,
        company: r.company,
        inquiryStatus: r.status,
        eventDate: r.event_date,
        booking: booking
          ? { title: booking.title, status: booking.status, starts_at: booking.starts_at }
          : null,
      });
      return {
        id: r.id,
        tenantId: r.tenant_id,
        status: visit.status,
        title: visit.title,
        eventDate: visit.eventDate,
        startsAtZone: visit.startsAtZone,
        eventLocation: r.event_location,
        createdAt: r.created_at,
        nextActionBy: r.next_action_by,
        booking: booking
          ? {
              id: booking.id ?? null,
              amountCents: toCents(booking.total_client_revenue),
              currencyCode: booking.currency_code ?? null,
              paymentStatus: booking.payment_status ?? null,
            }
          : null,
      };
    });

    return shapeMeData(mapped, Date.now());
  } catch (error) {
    logServerError("me.loadMeData", error);
    return EMPTY_ME;
  }
}
