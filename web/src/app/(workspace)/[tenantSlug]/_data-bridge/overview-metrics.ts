import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadExceptions } from "@/lib/exceptions/read";
import { logServerError } from "@/lib/server/safe-error";
import { guardedQuery } from "@/lib/server/guarded-query";
import { loadPlatformOperatingCurrency } from "@/lib/platform/operating-currency";
import { withTimeout } from "@/lib/tulala/with-timeout";
import { mapOverviewCounts, type OverviewCounts } from "./overview-counts";
import { loadOverviewCountsLegacy } from "./overview-counts-legacy";

let loggedCountsFallback = false;

/**
 * The financial KPI read joins every commission snapshot to its booking and
 * has hit the statement timeout on production (57014, 2026-09-09 → 09-16);
 * the layout awaits this wave on EVERY admin page, so that one query took the
 * POS down with it. The identity chip's payout line is decoration: past this
 * budget it reads as unknown and the page paints.
 */
const FINANCIAL_KPI_BUDGET_MS = 1_500;

/**
 * _data-bridge/overview-metrics.ts — workspace KPI loader.
 *
 * Split out of `_data-bridge.ts` (rev 13). Powers the overview page +
 * top-bar counts. Single Promise.all fan-out across 8 small COUNT queries
 * so the page renders in one round-trip.
 */

export type WorkspaceOverviewMetrics = {
  /** Total rostered talent (status != removed). */
  rosterTotal: number;
  /** Rostered talent with workflow_status = 'published' and roster status = 'active'. */
  rosterPublished: number;
  /** Active open inquiries (status IN ('submitted','coordination','offer_pending','approved')). */
  openInquiries: number;
  /** Active workspace members (agency_memberships.status = 'active'). */
  teamMembers: number;
  /** Roster rows with status = 'pending' — talent awaiting agency approval. */
  pendingApprovals: number;
  /** Inquiries waiting for client decision (next_action_by = 'client'). */
  awaitingClientCount: number;
  /** Inquiries in draft state. */
  draftInquiryCount: number;
  /**
   * "Your move" cohort — work the agency owes action on right now. Three
   * mutually-exclusive (by status) real counts that power the single
   * "Needs you now" surface on the overview:
   *  - unassignedOpenCount: open (submitted/coordination/offer_pending) with
   *    coordinator_id IS NULL — nobody is driving them, an admin must claim one.
   *  - agencyActionCount: same open statuses, assigned, where next_action_by is
   *    'coordinator'/'admin' — the assigned owner owes the next move.
   *  - readyToBookCount: status = 'approved' — client signed off, one
   *    Move-to-Booked away from a confirmed job.
   * Drafts are tracked separately by {@link draftInquiryCount}.
   */
  unassignedOpenCount: number;
  agencyActionCount: number;
  readyToBookCount: number;
  /** Days since the oldest coordinator-pending inquiry was created. Null if none. */
  oldestCoordinatorWaitDays: number | null;
  /** Label for the next upcoming confirmed booking (contact_name + event_date). Null if none. */
  nextBookingLabel: string | null;
  /** ISO date of the next upcoming booking. Null if none. */
  nextBookingDate: string | null;
  /** Public-surface (directory + talent profile + card) views in the last 7d. Null if disabled / errored. */
  storefrontViews7d: number | null;
  /** Growth label vs. prior 7d window (e.g. "+18%", "-5%", "new"). Null if no prior data. */
  storefrontGrowthLabel: string | null;
  /**
   * Workspace commission lane (`workspace_fee_cents`) owed but not yet
   * marked `payout_lifecycle = 'paid'`. Excludes cancelled bookings.
   * EUR-only; non-EUR rows are dropped with a server log (snapshot v1
   * does not convert currencies — see decision-log L43 + transaction
   * architecture §10). `null` when the loader couldn't read snapshots.
   */
  pendingPayoutCents: number | null;
  /**
   * Workspace commission lane (`workspace_fee_cents`) YTD across
   * confirmed/completed bookings for this tenant. EUR-only.
   */
  confirmedYtdWorkspaceCents: number | null;
  /**
   * Count of distinct YTD `agency_bookings` rows in
   * `('confirmed','completed')` for this tenant.
   */
  confirmedBookingCount: number | null;
  /**
   * ISO-4217 the workspace KPI cents are denominated in — the platform
   * operating currency (default USD). The identity bar formats
   * `pendingPayoutCents` with this so it never shows a hardcoded €.
   */
  kpiCurrency: string | null;
  /**
   * Bookings whose `currency_code` differs from the platform operating
   * currency. These are NOT included in `pendingPayoutCents` /
   * `confirmedYtdWorkspaceCents` (no live FX conversion). Each entry holds
   * the currency code plus the summed workspace_fee_cents for pending and
   * YTD-confirmed rows in that currency so the UI can surface them rather
   * than silently hiding them.
   *
   * Empty array (not null) when every booking matches the operating currency.
   * Null only when the financial KPI loader itself errored.
   */
  offCurrencySubtotals: Array<{
    currency: string;
    pendingCents: number;
    confirmedYtdCents: number;
    confirmedCount: number;
  }> | null;
  /**
   * Open exceptions (the Issues queue: refunds owed, ticket shortfalls, failed
   * effects, uncertain card collections, dead jobs, stale claims), for the
   * rail's Issues count. `null` when the queue could not be read at all; a
   * number with some sources unavailable is a lower bound, which the Issues
   * page itself says out loud.
   */
  issuesOpenCount: number | null;
};

/** `null` = the queue could not be read; see `issuesOpenCount`. */
async function countOpenExceptions(tenantId: string): Promise<number | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    // Hrefs are not read from a count, so the slug the reader wants for them
    // can be empty here.
    const load = await loadExceptions(admin, { tenantId, tenantSlug: "" });
    if (load.rows.length === 0 && load.unavailable.length > 0) return null;
    return load.summary.total;
  } catch (err) {
    logServerError("workspace.loadOverviewMetrics.issues", err);
    return null;
  }
}

export async function loadWorkspaceOverviewMetrics(
  tenantId: string,
): Promise<WorkspaceOverviewMetrics | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    // One function call replaces the ten per-table count reads (migration
    // 20261231356000, SECURITY INVOKER so the caller's RLS applies as before).
    const [countsRes, viewsRes, financialKpisRes, issuesOpenCount] = await Promise.all([
      supabase.rpc("workspace_overview_counts", {
        p_tenant_id: tenantId,
        p_today: new Date().toISOString().slice(0, 10),
      }),
      loadStorefrontViews7d(tenantId),
      withTimeout(loadWorkspaceFinancialKpis(tenantId), FINANCIAL_KPI_BUDGET_MS, null),
      // The Issues queue, counted for the rail. Reads with the service role
      // like the Issues page itself: three of its six sources are engine
      // tables no membership policy grants a person.
      countOpenExceptions(tenantId),
    ]);

    let counts: OverviewCounts;
    if (countsRes.error) {
      // Missing function (code before migration) or any error: log once per
      // process, then read the way this loader did before the RPC existed.
      if (!loggedCountsFallback) {
        loggedCountsFallback = true;
        logServerError("workspace.loadOverviewMetrics.counts", countsRes.error);
      }
      counts = await loadOverviewCountsLegacy(supabase, tenantId);
    } else {
      counts = mapOverviewCounts(countsRes.data);
    }

    const oldestCoordinatorWaitDays = counts.oldestCoordinatorCreatedAt
      ? Math.floor((Date.now() - new Date(counts.oldestCoordinatorCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const nextBookingDate = counts.nextBooking?.eventDate ?? null;
    const nextBookingContact = counts.nextBooking?.contactName ?? null;
    const nextBookingLabel = nextBookingContact
      ? (() => {
          if (!nextBookingDate) return nextBookingContact;
          const d = new Date(nextBookingDate);
          const month = d.toLocaleDateString("en-GB", { month: "short" });
          const day = d.getDate();
          return `${nextBookingContact} · ${month} ${day}`;
        })()
      : null;

    return {
      rosterTotal: counts.rosterTotal,
      rosterPublished: counts.rosterPublished,
      openInquiries: counts.openInquiries,
      teamMembers: counts.teamMembers,
      pendingApprovals: counts.pendingApprovals,
      awaitingClientCount: counts.awaitingClientCount,
      draftInquiryCount: counts.draftInquiryCount,
      unassignedOpenCount: counts.unassignedOpenCount,
      agencyActionCount: counts.agencyActionCount,
      readyToBookCount: counts.readyToBookCount,
      oldestCoordinatorWaitDays,
      nextBookingLabel,
      nextBookingDate,
      storefrontViews7d: viewsRes?.views ?? null,
      storefrontGrowthLabel: viewsRes?.growthLabel ?? null,
      pendingPayoutCents: financialKpisRes?.pendingPayoutCents ?? null,
      confirmedYtdWorkspaceCents: financialKpisRes?.confirmedYtdWorkspaceCents ?? null,
      confirmedBookingCount: financialKpisRes?.confirmedBookingCount ?? null,
      kpiCurrency: financialKpisRes?.currency ?? null,
      offCurrencySubtotals: financialKpisRes?.offCurrencySubtotals ?? null,
      issuesOpenCount,
    };
  } catch (err) {
    logServerError("workspace.loadOverviewMetrics", err);
    return null;
  }
}

/**
 * Storefront / directory views in the last 7 days, with growth vs. the
 * prior 7-day window. Reads `analytics_events` for event names that
 * represent a public-surface view (`view_directory`, `view_talent_card`,
 * `view_talent_profile`). Returns `null` on error or no signal so the
 * caller can fall back to the demo badge.
 */
export type StorefrontViews7d = { views: number; growthLabel: string | null };

export async function loadStorefrontViews7d(
  tenantId: string,
): Promise<StorefrontViews7d | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const now = Date.now();
    const day = 86_400_000;
    const sevenAgo = new Date(now - 7 * day).toISOString();
    const fourteenAgo = new Date(now - 14 * day).toISOString();
    const VIEW_EVENTS = ["view_directory", "view_talent_card", "view_talent_profile"];

    const [cur, prev] = await Promise.all([
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("name", VIEW_EVENTS)
        .gte("created_at", sevenAgo),
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("name", VIEW_EVENTS)
        .gte("created_at", fourteenAgo)
        .lt("created_at", sevenAgo),
    ]);

    const views = cur.count ?? 0;
    const prevViews = prev.count ?? 0;

    let growthLabel: string | null = null;
    if (prevViews > 0) {
      const pct = Math.round(((views - prevViews) / prevViews) * 100);
      growthLabel = `${pct >= 0 ? "+" : ""}${pct}%`;
    } else if (views > 0) {
      growthLabel = "new";
    }

    return { views, growthLabel };
  } catch (err) {
    logServerError("workspace.loadStorefrontViews7d", err);
    return null;
  }
}

/**
 * Workspace financial KPIs surfaced in the identity bar and Overview.
 *
 * Reads `booking_commission_snapshot` joined to `agency_bookings` for the
 * tenant. Single-currency — rows not in the platform operating currency
 * (default USD) are excluded with a server log (no FX; multi-currency
 * aggregation is deferred; see transaction-architecture §10). Per
 * decision-log L43 the workspace's earned commission lane is
 * `workspace_fee_cents`. Talent Money reads `talent_net_cents` from the
 * same snapshot rows — the two surfaces must agree to the cent on the
 * lanes they project.
 */
type WorkspaceFinancialKpis = {
  pendingPayoutCents: number;
  confirmedYtdWorkspaceCents: number;
  confirmedBookingCount: number;
  /** The currency these cents are denominated in (the platform operating currency). */
  currency: string;
  /** Per-currency aggregates for bookings not in the operating currency. */
  offCurrencySubtotals: Array<{
    currency: string;
    pendingCents: number;
    confirmedYtdCents: number;
    confirmedCount: number;
  }>;
};

async function loadWorkspaceFinancialKpis(
  tenantId: string,
): Promise<WorkspaceFinancialKpis | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    // USD-first: KPIs sum within a single currency (no FX). Sum the platform
    // operating currency (default USD), not a hard-coded EUR — otherwise every
    // USD booking is excluded and the Overview financials read zero.
    const { operatingCurrency } = await loadPlatformOperatingCurrency();
    const kpiCurrency = operatingCurrency.toUpperCase();

    const year = new Date().getUTCFullYear();
    const ytdSince = `${year}-01-01T00:00:00.000Z`;

    // Snapshots scoped to this tenant's owning rows (agency/workspace lane).
    // Joined to agency_bookings so we can filter cancelled/pending bookings.
    const { data, error } = await supabase
      .from("booking_commission_snapshot")
      .select(
        `
          booking_id,
          workspace_fee_cents,
          currency_code,
          agency_bookings!inner (
            id,
            status,
            payout_lifecycle,
            event_date,
            starts_at,
            created_at,
            tenant_id
          )
        `,
      )
      .in("owning_party_type", ["agency", "workspace"])
      .eq("owning_party_id", tenantId);

    if (error) {
      logServerError("workspace.loadFinancialKpis", error);
      return null;
    }

    type Row = {
      booking_id: string;
      workspace_fee_cents: number;
      currency_code: string;
      agency_bookings: {
        id: string;
        status: string;
        payout_lifecycle: string;
        event_date: string | null;
        starts_at: string | null;
        created_at: string | null;
        tenant_id: string;
      };
    };

    let pending = 0;
    let confirmedYtd = 0;
    const confirmedBookings = new Set<string>();
    const ytdMs = Date.parse(ytdSince);

    // Accumulator for off-currency rows — keyed by uppercase ISO-4217 code.
    const offCurrencyMap = new Map<string, {
      pendingCents: number;
      confirmedYtdCents: number;
      confirmedBookingIds: Set<string>;
    }>();

    for (const raw of (data ?? []) as unknown as Row[]) {
      const rowCurrency = (raw.currency_code ?? "").toUpperCase();
      const b = raw.agency_bookings;
      // Belt-and-braces — RLS already scopes to this tenant.
      if (b.tenant_id !== tenantId) continue;
      if (b.status === "cancelled") continue;

      if (rowCurrency !== kpiCurrency) {
        // Off-currency booking: aggregate into per-currency subtotals rather
        // than silently dropping. No FX conversion — the caller surfaces these
        // as a separate figure so no money is hidden. Downgraded from error to
        // info because mixed-currency workspaces are expected, not anomalous.
        // eslint-disable-next-line no-console
        console.info(
          `[workspace.loadFinancialKpis.off_currency] ${rowCurrency} snapshot (operating ${kpiCurrency}) for booking ${raw.booking_id} — aggregated separately`,
        );
        const bucket = offCurrencyMap.get(rowCurrency) ?? {
          pendingCents: 0,
          confirmedYtdCents: 0,
          confirmedBookingIds: new Set<string>(),
        };
        if (b.payout_lifecycle !== "paid") {
          bucket.pendingCents += raw.workspace_fee_cents;
        }
        if (b.status === "confirmed" || b.status === "completed") {
          const dateIso = b.event_date ?? b.starts_at ?? b.created_at;
          const ts = dateIso ? Date.parse(dateIso) : NaN;
          if (!Number.isNaN(ts) && ts >= ytdMs) {
            bucket.confirmedYtdCents += raw.workspace_fee_cents;
            bucket.confirmedBookingIds.add(b.id);
          }
        }
        offCurrencyMap.set(rowCurrency, bucket);
        continue;
      }

      // Pending payout: workspace lane that hasn't been paid yet.
      if (b.payout_lifecycle !== "paid") {
        pending += raw.workspace_fee_cents;
      }

      // YTD confirmed: include confirmed + completed within calendar year.
      if (b.status === "confirmed" || b.status === "completed") {
        const dateIso = b.event_date ?? b.starts_at ?? b.created_at;
        const ts = dateIso ? Date.parse(dateIso) : NaN;
        if (!Number.isNaN(ts) && ts >= ytdMs) {
          confirmedYtd += raw.workspace_fee_cents;
          confirmedBookings.add(b.id);
        }
      }
    }

    const offCurrencySubtotals = Array.from(offCurrencyMap.entries()).map(
      ([currency, bucket]) => ({
        currency,
        pendingCents: bucket.pendingCents,
        confirmedYtdCents: bucket.confirmedYtdCents,
        confirmedCount: bucket.confirmedBookingIds.size,
      }),
    );

    return {
      pendingPayoutCents: pending,
      confirmedYtdWorkspaceCents: confirmedYtd,
      confirmedBookingCount: confirmedBookings.size,
      currency: kpiCurrency,
      offCurrencySubtotals,
    };
  } catch (err) {
    logServerError("workspace.loadFinancialKpis", err);
    return null;
  }
}

/**
 * Return the count of roster rows with status = 'pending' for this tenant.
 * Used by the admin layout to badge the Talent tab.
 */
export async function loadPendingRosterCount(tenantId: string): Promise<number> {
  // A.3 — wrap with guardedQuery so an unauthenticated bridge call
  // (drawer importing this directly, future refactor) returns 0
  // instead of leaking the count via a service-role-equivalent path.
  const result = await guardedQuery("loadPendingRosterCount", "staff", async () => {
    try {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return 0;
      const { count } = await supabase
        .from("agency_talent_roster")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending");
      return count ?? 0;
    } catch (err) {
      logServerError("workspace.loadPendingRosterCount", err);
      return 0;
    }
  });
  return result ?? 0;
}
