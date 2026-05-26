import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchTenantSnapshotAggregateRows,
  type TenantSnapshotAggregateRow,
} from "@/lib/billing/snapshot-aggregations";
import {
  buildAgencyFinancials,
  EMPTY_AGENCY_FINANCIALS,
  type AgencyFinancials,
  type AgencyFinancialsRow,
} from "@/lib/billing/agency-financials-types";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

export type { AgencyFinancials, AgencyFinancialsRow } from "@/lib/billing/agency-financials-types";

function defaultYtdSinceIso(): string {
  const year = new Date().getUTCFullYear();
  return `${year}-01-01T00:00:00.000Z`;
}

function mapSnapshotRowToFinancialsRow(
  row: TenantSnapshotAggregateRow,
): AgencyFinancialsRow {
  return {
    bookingId: row.bookingId,
    bookingTalentId: row.bookingTalentId,
    participantId: row.participantId,
    tenantId: row.tenantId,
    workDate: row.workDate,
    payoutDate: row.payoutDate,
    clientLabel: row.clientLabel,
    talentProfileId: row.talentProfileId,
    talentDisplayName: row.talentDisplayName,
    grossCents: row.grossCents,
    platformFeeCents: row.platformFeeCents,
    workspaceFeeCents: row.workspaceFeeCents,
    talentNetCents: row.talentNetCents,
    status: row.status,
    paymentMethod: row.paymentMethod,
    currencyCode: row.currencyCode,
  };
}

export async function loadAgencyFinancialsWithSupabase(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { sinceISO?: string },
): Promise<AgencyFinancials> {
  try {
    const since = opts?.sinceISO ?? defaultYtdSinceIso();
    const snapshotRows = await fetchTenantSnapshotAggregateRows(supabase, {
      tenantId,
      since,
    });
    const rows = snapshotRows.map(mapSnapshotRowToFinancialsRow);
    return buildAgencyFinancials(rows);
  } catch (err) {
    logServerError("billing/agency-financials.load", err);
    return EMPTY_AGENCY_FINANCIALS;
  }
}

/**
 * Loader for the admin Business Financials surface
 * (`/{tenantSlug}/admin/financials`). Cached per-request via React's `cache`
 * so the layout prefetch + the page itself share one DB round-trip.
 *
 * Reads under the calling user's RLS — the snapshot policy admits
 * platform admin and `is_staff_of_tenant`. Capability gating (manage_billing)
 * is enforced at the route boundary, not here.
 */
export const loadAgencyFinancials = cache(
  async (
    tenantId: string,
    opts?: { sinceISO?: string },
  ): Promise<AgencyFinancials> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return EMPTY_AGENCY_FINANCIALS;
    return loadAgencyFinancialsWithSupabase(supabase, tenantId, opts);
  },
);

export type AgencyFinancialsByCurrency = {
  /** ISO-4217 code from `agencies.default_currency`. Selected first in tabs. */
  defaultCurrency: string;
  /**
   * Per-currency bundles, sorted with `defaultCurrency` first then by
   * gross descending. Empty when the tenant has no snapshot rows of any
   * currency.
   */
  byCurrency: AgencyFinancials[];
  /** All non-empty currency codes for tab labels. */
  currencies: string[];
};

const EMPTY_BY_CURRENCY: AgencyFinancialsByCurrency = {
  defaultCurrency: "EUR",
  byCurrency: [],
  currencies: [],
};

/**
 * Multi-currency variant of `loadAgencyFinancials` (PR-E, L49).
 *
 * Reads ALL currency snapshot rows for the tenant (no EUR filter),
 * groups by `currencyCode`, projects each bundle through
 * `buildAgencyFinancials`, and surfaces the agency's
 * `default_currency` so the tabs UI knows which one to select first.
 *
 * Display-only — no FX conversion anywhere. Talent surface keeps its
 * EUR-only single-currency behavior; this is admin-only at v1.
 */
export const loadAgencyFinancialsByCurrency = cache(
  async (
    tenantId: string,
    opts?: { sinceISO?: string },
  ): Promise<AgencyFinancialsByCurrency> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return EMPTY_BY_CURRENCY;

    const since = opts?.sinceISO ?? defaultYtdSinceIso();

    const [snapshotRowsRes, agencyRes] = await Promise.all([
      fetchTenantSnapshotAggregateRows(supabase, {
        tenantId,
        since,
        includeAllCurrencies: true,
      }),
      supabase
        .from("agencies")
        .select("default_currency")
        .eq("id", tenantId)
        .maybeSingle(),
    ]);

    const defaultCurrency =
      ((agencyRes.data as { default_currency?: string } | null)?.default_currency
        ?? "EUR")
        .toUpperCase();

    if (snapshotRowsRes.length === 0) {
      return { defaultCurrency, byCurrency: [], currencies: [] };
    }

    const byCurrencyRows = new Map<string, AgencyFinancialsRow[]>();
    for (const snap of snapshotRowsRes) {
      const code = (snap.currencyCode ?? "EUR").toUpperCase();
      const list = byCurrencyRows.get(code) ?? [];
      list.push(mapSnapshotRowToFinancialsRow(snap));
      byCurrencyRows.set(code, list);
    }

    const bundles: AgencyFinancials[] = [];
    for (const [code, rows] of byCurrencyRows) {
      bundles.push(buildAgencyFinancials(rows, { currency: code }));
    }
    bundles.sort((a, b) => {
      if (a.totals.currency === defaultCurrency) return -1;
      if (b.totals.currency === defaultCurrency) return 1;
      return b.totals.ytdGrossCents - a.totals.ytdGrossCents;
    });

    return {
      defaultCurrency,
      byCurrency: bundles,
      currencies: bundles.map((b) => b.totals.currency),
    };
  },
);
