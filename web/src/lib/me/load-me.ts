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

import { EMPTY_ME, shapeMeData, type MeData, type MeRow } from "./shape-me";

type BookingJoin = {
  id?: string | null;
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

    const { data, error } = await admin
      .from("inquiries")
      .select(
        `id, tenant_id, status, company, event_date, event_location, created_at, next_action_by,
         agency_bookings!agency_bookings_source_inquiry_id_fkey ( id, total_client_revenue, currency_code, payment_status )`,
      )
      .eq("client_user_id", userId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("me.loadMeData", error);
      return EMPTY_ME;
    }

    const rows = (data ?? []) as unknown as Row[];
    const mapped: MeRow[] = rows.map((r) => {
      const booking = Array.isArray(r.agency_bookings)
        ? r.agency_bookings[0]
        : r.agency_bookings;
      return {
        id: r.id,
        tenantId: r.tenant_id,
        status: r.status,
        title: r.company,
        eventDate: r.event_date,
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
