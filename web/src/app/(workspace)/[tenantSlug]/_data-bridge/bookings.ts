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

// ─── CW5 — client payment history ────────────────────────────────────────────

export type ClientTransactionRow = {
  id: string;
  /** agency_bookings.id — also the receipt route key. */
  bookingId: string;
  /** GROSS the client paid, cents. Never the platform/agency/talent split. */
  grossAmountCents: number;
  currency: string;
  /** paid | refunded | requested | … (booking_transactions.status). */
  status: string;
  /** deposit | balance | full */
  checkoutType: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  /** Set when this row is a refund of an earlier payment. */
  refundOfTransactionId: string | null;
};

/**
 * Payments THIS client made in THIS workspace, newest first. Reads
 * booking_transactions by payer_user_id — client-safe columns only (gross,
 * never fee/net splits). Refund rows come back with refund_of set so the UI
 * can label them. Service-role read with an explicit payer filter (same
 * trust model as the receipt route, which auth-checks the same ownership).
 */
export async function loadClientTransactions(
  userId: string,
  /**
   * Tenant scoping happens through the client's OWN agency_bookings ids
   * (loaded by loadClientBookings for this tenant). booking_transactions'
   * source_tenant_id carries a platform sentinel on hub-routed payments, so
   * filtering on it silently dropped real rows.
   */
  agencyBookingIds: string[],
): Promise<ClientTransactionRow[]> {
  try {
    if (agencyBookingIds.length === 0) return [];
    const admin = createServiceRoleClient();
    if (!admin) return [];
    const { data, error } = await admin
      .from("booking_transactions")
      .select(
        "id, booking_id, gross_amount_cents, currency, status, checkout_type, paid_at, refunded_at, created_at, refund_of_transaction_id",
      )
      .eq("payer_user_id", userId)
      .in("booking_id", agencyBookingIds)
      .in("status", ["paid", "refunded", "payout_pending", "payout_sent", "payout"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      logServerError("client.loadTransactions", error);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      bookingId: r.booking_id as string,
      grossAmountCents: Number(r.gross_amount_cents ?? 0),
      currency: ((r.currency as string | null) ?? "USD").toUpperCase(),
      status: (r.status as string) ?? "paid",
      checkoutType: (r.checkout_type as string | null) ?? null,
      paidAt: (r.paid_at as string | null) ?? null,
      refundedAt: (r.refunded_at as string | null) ?? null,
      createdAt: r.created_at as string,
      refundOfTransactionId: (r.refund_of_transaction_id as string | null) ?? null,
    }));
  } catch (err) {
    logServerError("client.loadTransactions", err);
    return [];
  }
}

/**
 * CH2 — bookings the client can pay RIGHT NOW.
 *
 * `loadClientTransactions` above is history (paid/refunded). This is the
 * live payable set: transactions staff have moved to `payment_requested`
 * (or that are mid-flight `pending`). Keyed by agency_bookings.id so the
 * bookings page can put a real Pay-now next to the row instead of only a
 * deep link into the message thread.
 *
 * Ownership: explicit `payer_user_id = userId` AND the caller passes only
 * booking ids that came from this client's own tenant-scoped bookings.
 */
export async function loadClientPayableTransactions(
  userId: string,
  agencyBookingIds: string[],
): Promise<Map<string, { transactionId: string; amountCents: number; currency: string; checkoutType: string | null }>> {
  const out = new Map<string, { transactionId: string; amountCents: number; currency: string; checkoutType: string | null }>();
  try {
    if (agencyBookingIds.length === 0) return out;
    const admin = createServiceRoleClient();
    if (!admin) return out;
    const { data, error } = await admin
      .from("booking_transactions")
      .select("id, booking_id, gross_amount_cents, currency, status, checkout_type, created_at")
      .eq("payer_user_id", userId)
      .in("booking_id", agencyBookingIds)
      .in("status", ["payment_requested", "pending"])
      .order("created_at", { ascending: false });
    if (error) {
      logServerError("client.loadPayableTransactions", error);
      return out;
    }
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const bookingId = r.booking_id as string;
      // Newest wins — the query is already ordered desc.
      if (out.has(bookingId)) continue;
      out.set(bookingId, {
        transactionId: r.id as string,
        amountCents: Number(r.gross_amount_cents ?? 0),
        currency: ((r.currency as string | null) ?? "USD").toUpperCase(),
        checkoutType: (r.checkout_type as string | null) ?? null,
      });
    }
    return out;
  } catch (err) {
    logServerError("client.loadPayableTransactions", err);
    return out;
  }
}
