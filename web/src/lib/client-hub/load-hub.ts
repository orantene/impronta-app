import "server-only";

/**
 * Cross-tenant client hub loaders (CH1, 2026-07-24).
 *
 * Every other client loader is scoped to ONE agency (`/[tenantSlug]/client/*`).
 * A client who books across several agencies has to hop between N separate
 * dashboards, unified only by a redirect to their "primary" agency. These
 * loaders drop the TENANT filter while keeping the client-ownership filter
 * (`client_user_id = userId`) absolutely intact, so a client sees all of their
 * own work in one place and never anyone else's.
 *
 * Gating lives at the page: the hub is a paid (Pro/Enterprise) capability —
 * see `lib/discover/client-subscription.ts`. These loaders are pure reads and
 * do not check entitlement themselves.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type HubAgency = {
  tenantId: string;
  slug: string;
  displayName: string;
  /** Open (non-terminal, non-booked) inquiries with this agency. */
  openInquiries: number;
  /** Confirmed bookings with this agency. */
  bookings: number;
  /** Inquiries where the ball is in the client's court. */
  needsYou: number;
};

export type HubInquiry = {
  id: string;
  tenantId: string;
  agencySlug: string;
  agencyName: string;
  status: string;
  company: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  createdAt: string;
  nextActionBy: string | null;
};

export type HubBooking = {
  id: string;
  tenantId: string;
  agencySlug: string;
  agencyName: string;
  company: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  amountCents: number | null;
  currencyCode: string | null;
  paymentStatus: string | null;
};

export type ClientHubData = {
  agencies: HubAgency[];
  /** Inquiries awaiting the client, newest first, across every agency. */
  needsYou: HubInquiry[];
  /** Confirmed bookings with a future (or unset) date, soonest first. */
  upcoming: HubBooking[];
  /** Unpaid/partial totals per currency across every agency. */
  dueByCurrency: { currency: string; cents: number }[];
  totals: { agencies: number; openInquiries: number; bookings: number };
};

const TERMINAL = [
  "declined",
  "rejected",
  "cancelled",
  "expired",
  "closed",
  "closed_lost",
  "archived",
  "draft",
];
const BOOKED = ["booked", "converted"];

const EMPTY: ClientHubData = {
  agencies: [],
  needsYou: [],
  upcoming: [],
  dueByCurrency: [],
  totals: { agencies: 0, openInquiries: 0, bookings: 0 },
};

/**
 * One pass over the client's inquiries across ALL tenants, plus the linked
 * booking rows, folded into the hub view model.
 */
export async function loadClientHubData(userId: string): Promise<ClientHubData> {
  if (!userId) return EMPTY;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return EMPTY;

    // Ownership filter ONLY — no tenant scoping. This is the whole point of
    // the hub, and `client_user_id` keeps it strictly the caller's own rows.
    const { data, error } = await admin
      .from("inquiries")
      .select(
        `id, tenant_id, status, company, event_date, event_location, created_at, next_action_by,
         agencies!tenant_id ( slug, display_name ),
         agency_bookings!agency_bookings_source_inquiry_id_fkey ( id, total_client_revenue, currency_code, payment_status )`,
      )
      .eq("client_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(400);

    if (error) {
      logServerError("client-hub.loadHubData", error);
      return EMPTY;
    }

    type AgencyJoin = { slug: string | null; display_name: string | null };
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
      agencies: AgencyJoin | AgencyJoin[] | null;
      agency_bookings: BookingJoin | BookingJoin[] | null;
    };

    const rows = (data ?? []) as unknown as Row[];

    const agencyMap = new Map<string, HubAgency>();
    const needsYou: HubInquiry[] = [];
    const upcoming: HubBooking[] = [];
    const dueMap = new Map<string, number>();
    let openInquiries = 0;
    let bookingCount = 0;

    const todayMs = Date.now() - 24 * 60 * 60 * 1000; // yesterday: keep today's events

    for (const r of rows) {
      const agency = Array.isArray(r.agencies) ? r.agencies[0] : r.agencies;
      const slug = agency?.slug ?? "";
      const agencyName = agency?.display_name ?? "Agency";
      // A tenant we cannot name/route to is not useful in the hub.
      if (!slug) continue;

      const status = r.status ?? "submitted";
      const isTerminal = TERMINAL.includes(status);
      const isBooked = BOOKED.includes(status);
      const isOpen = !isTerminal && !isBooked;
      const wantsClient = r.next_action_by === "client" || status === "offer_pending";

      const entry = agencyMap.get(r.tenant_id) ?? {
        tenantId: r.tenant_id,
        slug,
        displayName: agencyName,
        openInquiries: 0,
        bookings: 0,
        needsYou: 0,
      };
      if (isOpen) {
        entry.openInquiries += 1;
        openInquiries += 1;
      }
      if (isBooked) {
        entry.bookings += 1;
        bookingCount += 1;
      }
      if (isOpen && wantsClient) {
        entry.needsYou += 1;
        needsYou.push({
          id: r.id,
          tenantId: r.tenant_id,
          agencySlug: slug,
          agencyName,
          status,
          company: r.company,
          eventDate: r.event_date,
          eventLocation: r.event_location,
          createdAt: r.created_at,
          nextActionBy: r.next_action_by,
        });
      }
      agencyMap.set(r.tenant_id, entry);

      if (!isBooked) continue;

      const bookingJoin = Array.isArray(r.agency_bookings) ? r.agency_bookings[0] : r.agency_bookings;
      const rawRevenue = bookingJoin?.total_client_revenue;
      const amountCents = rawRevenue != null ? Math.round(Number(rawRevenue) * 100) : null;
      const paymentStatus = bookingJoin?.payment_status ?? null;
      const currencyCode = (bookingJoin?.currency_code ?? null)?.toUpperCase() ?? null;

      if ((paymentStatus === "unpaid" || paymentStatus === "partial") && (amountCents ?? 0) > 0) {
        const cur = currencyCode ?? "USD";
        dueMap.set(cur, (dueMap.get(cur) ?? 0) + (amountCents ?? 0));
      }

      const eventMs = r.event_date ? new Date(r.event_date).getTime() : null;
      if (eventMs === null || eventMs >= todayMs) {
        upcoming.push({
          id: r.id,
          tenantId: r.tenant_id,
          agencySlug: slug,
          agencyName,
          company: r.company,
          eventDate: r.event_date,
          eventLocation: r.event_location,
          amountCents,
          currencyCode,
          paymentStatus,
        });
      }
    }

    upcoming.sort((a, b) => {
      const aT = a.eventDate ? new Date(a.eventDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bT = b.eventDate ? new Date(b.eventDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aT - bT;
    });

    const agencies = [...agencyMap.values()].sort(
      (a, b) => b.needsYou - a.needsYou || b.openInquiries - a.openInquiries || a.displayName.localeCompare(b.displayName),
    );

    return {
      agencies,
      needsYou,
      upcoming: upcoming.slice(0, 12),
      dueByCurrency: [...dueMap.entries()]
        .map(([currency, cents]) => ({ currency, cents }))
        .sort((a, b) => b.cents - a.cents),
      totals: { agencies: agencies.length, openInquiries, bookings: bookingCount },
    };
  } catch (err) {
    logServerError("client-hub.loadHubData", err);
    return EMPTY;
  }
}
