import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchTalentSnapshotAggregateRows } from "@/lib/billing/snapshot-aggregations";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import {
  buildTalentEarnings,
  EMPTY_TALENT_EARNINGS,
  type TalentEarnings,
} from "@/lib/talent/earnings-types";

export type {
  TalentEarnings,
  TalentEarningsPerAgency,
  TalentEarningsRow,
  TalentSnapshotAggregateRow,
} from "@/lib/talent/earnings-types";
export {
  buildTalentEarnings,
  EMPTY_TALENT_EARNINGS,
  mapBookingPayoutStatus,
} from "@/lib/talent/earnings-types";
export {
  formatEurCents,
  mockTalentEarningsFromFixtures,
} from "@/lib/talent/earnings-view";

function defaultYtdSinceIso(): string {
  const year = new Date().getUTCFullYear();
  return `${year}-01-01T00:00:00.000Z`;
}

export async function loadTalentEarningsWithSupabase(
  supabase: SupabaseClient,
  talentProfileId: string,
  opts?: { sinceISO?: string; agencyFilter?: string },
): Promise<TalentEarnings> {
  try {
    const since = opts?.sinceISO ?? defaultYtdSinceIso();
    const rows = await fetchTalentSnapshotAggregateRows(supabase, {
      talentProfileId,
      since,
      agencyFilter: opts?.agencyFilter,
    });
    return buildTalentEarnings(rows);
  } catch (err) {
    logServerError("talent/earnings.load", err);
    return EMPTY_TALENT_EARNINGS;
  }
}

export const loadTalentEarnings = cache(
  async (
    talentProfileId: string,
    opts?: { sinceISO?: string; agencyFilter?: string },
  ): Promise<TalentEarnings> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return EMPTY_TALENT_EARNINGS;
    return loadTalentEarningsWithSupabase(supabase, talentProfileId, opts);
  },
);
