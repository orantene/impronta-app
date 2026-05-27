/**
 * fx-preview.ts — daily ECB FX rates via Frankfurter.
 *
 * Used by the "$49 USD = …" header strip on the Product Pricing
 * dashboard so the operator can sanity-check what a USD price translates
 * to in each supported currency.
 *
 * Why Frankfurter (and not exchangerate.host): exchangerate.host now
 * requires an API key (returns 403 `missing_access_key` since early
 * 2026). Frankfurter is free, no key, daily ECB rates.
 *
 *   https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN,EUR,...
 *
 * ECB does NOT quote ARS / COP / CLP / PEN — those are excluded from
 * the `symbols` request and rendered as "—" with a tooltip in the UI.
 * Phase 1+ follow-up: integrate Open Exchange Rates (free tier, 1k
 * req/mo, requires API key) for LATAM coverage. See:
 *   - pricing-types.ts → ECB_UNCOVERED_CURRENCIES
 *
 * Cached for ~12h via `next: { revalidate: 43200 }` — rates only change
 * once a day so per-request fetching would burn quota for no gain.
 */

import "server-only";
import type { FxPreview } from "./pricing-types";

const FRANKFURTER_SYMBOLS = ["MXN", "EUR", "GBP", "BRL", "CAD", "AUD"] as const;
const ENDPOINT =
  `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${FRANKFURTER_SYMBOLS.join(",")}`;
const TWELVE_HOURS_SECS = 43200;

type FrankfurterResponse = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

export async function loadFxPreview(): Promise<FxPreview> {
  const now = new Date().toISOString();
  try {
    const res = await fetch(ENDPOINT, {
      next: { revalidate: TWELVE_HOURS_SECS, tags: ["pricing-fx"] },
      // 4s timeout via AbortSignal — the dashboard should still render
      // if Frankfurter is slow or down.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Frankfurter HTTP ${res.status}`,
        fetchedAt: now,
      };
    }
    const body = (await res.json()) as FrankfurterResponse;
    if (!body?.rates || typeof body.rates !== "object") {
      return { ok: false, error: "Frankfurter returned no rates.", fetchedAt: now };
    }
    return {
      ok: true,
      base: "USD",
      fetchedAt: now,
      rateDate: body.date,
      rates: body.rates,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { ok: false, error: message, fetchedAt: now };
  }
}
