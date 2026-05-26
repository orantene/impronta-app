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
