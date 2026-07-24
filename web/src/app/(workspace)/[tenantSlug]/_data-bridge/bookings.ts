import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadTalentCardThumbs } from "./talent-card-thumbs";
import { loadTransactionsForTenant } from "@/lib/bookings/transactions";

/**
 * _data-bridge/bookings.ts — confirmed-booking loaders.
 *
 * Split out of `_data-bridge.ts` (rev 13). Two povs:
 *   - `loadWorkspaceBookings` (admin/staff view) — joins agency_bookings
 *     for revenue + active-transaction snapshot.
 *   - `loadClientBookings` (client view) — slimmer, scoped to one client.
 *
 * Both filter inquiries to status IN ('booked', 'converted').
 */

// ─── Workspace bookings (admin/staff) ─────────────────────────────────────────

export type WorkspaceBookingRow = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  created_at: string;
  /** Gross booking revenue in cents (from agency_bookings.total_client_revenue). Null if not set. */
  grossRevenueCents: number | null;
  /** Booking currency from agency_bookings.currency_code. */
  currencyCode: string | null;
  /** Active transaction status for this booking (null = no transaction yet). */
  transactionStatus: string | null;
  /** Snapshotted transaction amounts when an active transaction exists. */
  transactionGrossCents: number | null;
  transactionFeeBasisPoints: number | null;
  transactionFeeCents: number | null;
  transactionNetCents: number | null;
  transactionCurrency: string | null;
  /**
   * Audit A6 — Discover unified plan §6 source channel propagated from
   * the source inquiry. Lets the bookings page surface a "via Discover"
   * pill so workspace admin can see at a glance which jobs originated
   * from the cross-tenant catalog vs. the direct funnel.
   */
  sourceChannel: string | null;
};

/**
 * Load confirmed bookings for a tenant. Booked = status IN ('booked',
 * 'converted'). Ordered by event_date ascending so the next upcoming job
 * is first; null dates sort last.
 *
 * Returns [] on error. Never falls back to mock data.
 */
export async function loadWorkspaceBookings(
  tenantId: string,
): Promise<WorkspaceBookingRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Inquiries in booked/converted state + their linked agency_booking revenue.
    // Active transaction snapshots are loaded separately so the list always
    // reflects the canonical transaction amounts, not a recomputed preview.
    const { data, error } = await supabase
      .from("inquiries")
      .select(
        `id, contact_name, company, event_date, event_location, quantity, created_at, source_channel,
         agency_bookings!agency_bookings_source_inquiry_id_fkey(id, total_client_revenue, currency_code)`,
      )
      .eq("tenant_id", tenantId)
      .in("status", ["booked", "converted"])
      .order("event_date", { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) {
      // Fallback: if the join fails (e.g. fkey names differ), load plain rows
      logServerError("workspace.loadBookings", error);
      const { data: plain } = await supabase
        .from("inquiries")
        .select("id, contact_name, company, event_date, event_location, quantity, created_at, source_channel")
        .eq("tenant_id", tenantId)
        .in("status", ["booked", "converted"])
        .order("event_date", { ascending: true, nullsFirst: false })
        .limit(200);
      return (plain ?? []).map((r: Record<string, unknown>) => ({
        ...(r as Omit<
          WorkspaceBookingRow,
          | "grossRevenueCents"
          | "currencyCode"
          | "transactionStatus"
          | "transactionGrossCents"
          | "transactionFeeBasisPoints"
          | "transactionFeeCents"
          | "transactionNetCents"
          | "transactionCurrency"
          | "sourceChannel"
        >),
        sourceChannel: (r["source_channel"] as string | null) ?? null,
        grossRevenueCents: null,
        currencyCode: null,
        transactionStatus: null,
        transactionGrossCents: null,
        transactionFeeBasisPoints: null,
        transactionFeeCents: null,
        transactionNetCents: null,
        transactionCurrency: null,
      }));
    }

    const transactionsByBookingId = await loadTransactionsForTenant(tenantId, supabase);

    return (data ?? []).map((r: Record<string, unknown>) => {
      // total_client_revenue is NUMERIC in PG — convert to cents (×100)
      const bookingJoin = r["agency_bookings"] as
        | { id?: string; total_client_revenue?: number | string | null; currency_code?: string | null }
        | {
            id?: string;
            total_client_revenue?: number | string | null;
            currency_code?: string | null;
          }[]
        | null
        | undefined;
      const booking =
        Array.isArray(bookingJoin) ? bookingJoin[0] ?? null : bookingJoin ?? null;
      const rawRevenue = booking?.total_client_revenue;
      const grossRevenueCents = rawRevenue != null ? Math.round(Number(rawRevenue) * 100) : null;
      const tx = booking?.id ? transactionsByBookingId.get(booking.id) ?? null : null;

      return {
        id: r.id as string,
        contact_name: r.contact_name as string,
        company: r.company as string | null,
        event_date: r.event_date as string | null,
        event_location: r.event_location as string | null,
        quantity: r.quantity as number | null,
        created_at: r.created_at as string,
        sourceChannel: (r["source_channel"] as string | null) ?? null,
        grossRevenueCents,
        currencyCode: booking?.currency_code ?? null,
        transactionStatus: tx?.status ?? null,
        transactionGrossCents: tx?.grossAmountCents ?? null,
        transactionFeeBasisPoints: tx?.platformFeeBasisPoints ?? null,
        transactionFeeCents: tx?.platformFeeCents ?? null,
        transactionNetCents: tx?.netAmountCents ?? null,
        transactionCurrency: tx?.currency ?? null,
      };
    });
  } catch (err) {
    logServerError("workspace.loadBookings", err);
    return [];
  }
}

// ─── Client bookings (client pov) ─────────────────────────────────────────────

export type ClientBookingRow = {
  id: string;
  event_date: string | null;
  event_location: string | null;
  company: string | null;
  quantity: number | null;
  created_at: string;
  /** Gross the client pays, in cents (agency_bookings.total_client_revenue ×100). Null if no booking row yet. */
  amountCents: number | null;
  /** Booking currency (agency_bookings.currency_code). */
  currencyCode: string | null;
  /** Client-facing payment status from agency_bookings.payment_status: 'unpaid' | 'partial' | 'paid' | 'cancelled' | null. */
  paymentStatus: string | null;
  /**
   * D2 — The canonical agency_bookings.id, used for the receipt download
   * route (/api/receipt/[bookingId]).  Null if no booking row exists yet.
   */
  agencyBookingId: string | null;
  /**
   * CW3 — client-safe talent lineup (max 4): who is booked, with the same
   * card headshot every other surface shows (null = initials fallback).
   */
  talentLineup: { id: string; name: string; thumbUrl: string | null }[];
};

/**
 * Load confirmed bookings for a client at this tenant.
 * Booked = status IN ('booked', 'converted'). Ordered by event_date ascending.
 *
 * Joins the linked agency_bookings row (the canonical booking record) so the
 * client sees the real amount + payment status — not just a booked inquiry.
 * Client-safe: only GROSS (total_client_revenue, what the client pays) +
 * currency + payment_status; never the platform/agency/talent split.
 */
export async function loadClientBookings(
  userId: string,
  tenantId: string,
): Promise<ClientBookingRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const baseCols = "id, event_date, event_location, company, quantity, created_at";
    const { data, error } = await supabase
      .from("inquiries")
      .select(
        `${baseCols},
         agency_bookings!agency_bookings_source_inquiry_id_fkey(id, total_client_revenue, currency_code, payment_status)`,
      )
      .eq("tenant_id", tenantId)
      .eq("client_user_id", userId)
      .in("status", ["booked", "converted"])
      .order("event_date", { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) {
      // Fallback: if the join fails (e.g. fkey rename), load plain inquiry rows
      // so the page still renders (without amounts).
      logServerError("client.loadBookings", error);
      const { data: plain } = await supabase
        .from("inquiries")
        .select(baseCols)
        .eq("tenant_id", tenantId)
        .eq("client_user_id", userId)
        .in("status", ["booked", "converted"])
        .order("event_date", { ascending: true, nullsFirst: false })
        .limit(200);
      return (plain ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        event_date: (r.event_date as string | null) ?? null,
        event_location: (r.event_location as string | null) ?? null,
        company: (r.company as string | null) ?? null,
        quantity: (r.quantity as number | null) ?? null,
        created_at: r.created_at as string,
        amountCents: null,
        currencyCode: null,
        paymentStatus: null,
        agencyBookingId: null,
        talentLineup: [],
      }));
    }

    // CW3 — talent lineup per booked inquiry (names + card headshots).
    const bookedIds = (data ?? []).map((r: Record<string, unknown>) => r.id as string);
    const lineupByInquiry = new Map<string, { id: string; name: string; thumbUrl: string | null }[]>();
    if (bookedIds.length > 0) {
      const { data: parts, error: partsErr } = await supabase
        .from("inquiry_participants")
        .select(
          "inquiry_id, sort_order, talent_profiles!talent_profile_id (id, display_name, first_name, last_name)",
        )
        .eq("role", "talent")
        .neq("status", "removed")
        .in("inquiry_id", bookedIds)
        .order("sort_order", { ascending: true });
      if (partsErr) {
        logServerError("client.loadBookings.participants", partsErr);
      }
      type PartRaw = {
        inquiry_id: string;
        talent_profiles:
          | { id: string; display_name: string | null; first_name: string | null; last_name: string | null }
          | { id: string; display_name: string | null; first_name: string | null; last_name: string | null }[]
          | null;
      };
      const talentIds = new Set<string>();
      const pending: { inquiryId: string; id: string; name: string }[] = [];
      for (const row of (parts ?? []) as unknown as PartRaw[]) {
        const tp = Array.isArray(row.talent_profiles) ? row.talent_profiles[0] : row.talent_profiles;
        if (!tp) continue;
        const name = tp.display_name?.trim() || `${tp.first_name ?? ""} ${tp.last_name ?? ""}`.trim();
        if (!name) continue;
        pending.push({ inquiryId: row.inquiry_id, id: tp.id, name });
        talentIds.add(tp.id);
      }
      // Card headshots via the shared resolver (same crop as every surface).
      const admin = createServiceRoleClient();
      const thumbs = talentIds.size > 0
        ? await loadTalentCardThumbs(admin ?? supabase, [...talentIds])
        : new Map<string, string>();
      for (const pRow of pending) {
        const list = lineupByInquiry.get(pRow.inquiryId) ?? [];
        if (list.length < 4 && !list.some((t) => t.id === pRow.id)) {
          list.push({ id: pRow.id, name: pRow.name, thumbUrl: thumbs.get(pRow.id) ?? null });
        }
        lineupByInquiry.set(pRow.inquiryId, list);
      }
    }

    return (data ?? []).map((r: Record<string, unknown>) => {
      const bookingJoin = r["agency_bookings"] as
        | { id?: string | null; total_client_revenue?: number | string | null; currency_code?: string | null; payment_status?: string | null }
        | { id?: string | null; total_client_revenue?: number | string | null; currency_code?: string | null; payment_status?: string | null }[]
        | null
        | undefined;
      const booking = Array.isArray(bookingJoin) ? bookingJoin[0] ?? null : bookingJoin ?? null;
      const rawRevenue = booking?.total_client_revenue;
      return {
        id: r.id as string,
        event_date: (r.event_date as string | null) ?? null,
        event_location: (r.event_location as string | null) ?? null,
        company: (r.company as string | null) ?? null,
        quantity: (r.quantity as number | null) ?? null,
        created_at: r.created_at as string,
        amountCents: rawRevenue != null ? Math.round(Number(rawRevenue) * 100) : null,
        currencyCode: (booking?.currency_code as string | null) ?? null,
        paymentStatus: (booking?.payment_status as string | null) ?? null,
        agencyBookingId: (booking?.id as string | null) ?? null,
        talentLineup: lineupByInquiry.get(r.id as string) ?? [],
      };
    });
  } catch (err) {
    logServerError("client.loadBookings", err);
    return [];
  }
}
