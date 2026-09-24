/**
 * Server loader for the rates behind the "≈ US$" line (see usd-equivalent.ts).
 *
 * Reuses the daily ECB feed the platform commerce tab already reads
 * (fx-preview.ts: Frankfurter, no key, cached ~12h, 4s timeout). A failed or
 * slow fetch returns null and every "≈ US$" line simply does not render; the
 * page never waits on it and never shows an invented figure.
 */

import "server-only";

import { cache } from "react";

import { loadFxPreview } from "./fx-preview";
import type { UsdRates } from "./usd-equivalent";

export const loadUsdRates = cache(async (): Promise<UsdRates | null> => {
  const fx = await loadFxPreview();
  if (!fx.ok) return null;
  return { rateDate: fx.rateDate, perUsd: fx.rates };
});
