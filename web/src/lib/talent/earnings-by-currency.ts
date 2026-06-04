import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchTalentSnapshotAggregateRows } from "@/lib/billing/snapshot-aggregations";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import {
  buildTalentEarnings,
  type TalentEarnings,
  type TalentSnapshotAggregateRow,
} from "@/lib/talent/earnings-types";
// Re-export the type + client-safe helpers from the pure types module so
// existing server-side import sites keep working without churn. Client
// components import these directly from `earnings-by-currency-types` to
// avoid pulling `server-only` into the client bundle.
import {
  EMPTY_TALENT_EARNINGS_BY_CURRENCY,
  type TalentEarningsByCurrency,
} from "@/lib/talent/earnings-by-currency-types";

export {
  EMPTY_TALENT_EARNINGS_BY_CURRENCY,
  primaryBundleOrEmpty,
  type TalentEarningsByCurrency,
} from "@/lib/talent/earnings-by-currency-types";

function defaultYtdSinceIso(): string {
  const year = new Date().getUTCFullYear();
  return `${year}-01-01T00:00:00.000Z`;
}

/**
 * Multi-currency variant of `loadTalentEarnings` (L49 / talent Money tabs).
 *
 * Reads ALL currency snapshot rows for the talent (no EUR filter),
 * groups by `currencyCode`, projects each bundle through
 * `buildTalentEarnings`, and surfaces the talent's
 * `default_currency` so the tabs UI knows which one to select first.
 *
 * Display-only — no FX conversion anywhere. When the talent has only a
 * single currency, `byCurrency` contains exactly one element and the Money
 * surface suppresses the tab strip (existing single-currency UX preserved).
 */
export async function loadTalentEarningsByCurrencyWithSupabase(
  supabase: SupabaseClient,
  talentProfileId: string,
  opts?: { sinceISO?: string },
): Promise<TalentEarningsByCurrency> {
  try {
    const since = opts?.sinceISO ?? defaultYtdSinceIso();

    const [snapshotRows, profileRes] = await Promise.all([
      fetchTalentSnapshotAggregateRows(supabase, {
        talentProfileId,
        since,
        includeAllCurrencies: true,
      }),
      supabase
        .from("talent_profiles")
        .select("default_currency")
        .eq("id", talentProfileId)
        .maybeSingle(),
    ]);

    const defaultCurrency = (
      (profileRes.data as { default_currency?: string } | null)?.default_currency ?? "USD"
    ).toUpperCase();

    if (snapshotRows.length === 0) {
      return { defaultCurrency, byCurrency: [], currencies: [] };
    }

    // Group rows by currency code. Rows without a code fall back to "USD"
    // (USD-first: the platform operates in USD).
    const byCurrencyRows = new Map<string, TalentSnapshotAggregateRow[]>();
    for (const snap of snapshotRows) {
      const code = (snap.currencyCode ?? "USD").toUpperCase();
      const list = byCurrencyRows.get(code) ?? [];
      list.push(snap);
      byCurrencyRows.set(code, list);
    }

    const bundles: TalentEarnings[] = [];
    for (const [code, rows] of byCurrencyRows) {
      bundles.push(buildTalentEarnings(rows, { currency: code }));
    }

    // defaultCurrency first; then by ytdNetCents descending.
    bundles.sort((a, b) => {
      if (a.totals.currency === defaultCurrency) return -1;
      if (b.totals.currency === defaultCurrency) return 1;
      return b.totals.ytdNetCents - a.totals.ytdNetCents;
    });

    return {
      defaultCurrency,
      byCurrency: bundles,
      currencies: bundles.map((b) => b.totals.currency),
    };
  } catch (err) {
    logServerError("talent/earnings-by-currency.load", err);
    return EMPTY_TALENT_EARNINGS_BY_CURRENCY;
  }
}

export const loadTalentEarningsByCurrency = cache(
  async (
    talentProfileId: string,
    opts?: { sinceISO?: string },
  ): Promise<TalentEarningsByCurrency> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return EMPTY_TALENT_EARNINGS_BY_CURRENCY;
    return loadTalentEarningsByCurrencyWithSupabase(supabase, talentProfileId, opts);
  },
);

// `primaryBundleOrEmpty` lives in `earnings-by-currency-types.ts` (client-safe)
// and is re-exported at the top of this file.
