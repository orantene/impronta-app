/**
 * Pure display collapse for talent Money (A4). No I/O — safe for unit tests.
 */

import { EMPTY_TALENT_EARNINGS, type TalentEarnings } from "@/lib/talent/earnings-types";
import type { TalentEarningsByCurrency } from "@/lib/talent/earnings-by-currency-types";

export type OperatingCurrencySetting = {
  operatingCurrency: string;
  multiCurrencyDisplayEnabled: boolean;
};

/**
 * When platform multi-currency display is OFF, show ONE currency figure.
 *
 * Prefer the talent's own `defaultCurrency` (and her earnings in that code),
 * not the platform operating currency. Defect #7: an MXN talent was collapsed
 * to empty "USD $0" whenever multi-currency display was off and she had no
 * USD rows. No FX — display only. When ON, returns the input unchanged.
 */
export function applyOperatingCurrencyToEarnings(
  ec: TalentEarningsByCurrency,
  setting: OperatingCurrencySetting,
): TalentEarningsByCurrency {
  if (setting.multiCurrencyDisplayEnabled) return ec;

  const talentDefault = (
    ec.defaultCurrency ||
    setting.operatingCurrency ||
    "USD"
  ).toUpperCase();
  const preferred =
    ec.byCurrency.find((b) => b.totals.currency.toUpperCase() === talentDefault) ??
    ec.byCurrency[0] ??
    null;

  if (preferred) {
    const code = preferred.totals.currency.toUpperCase();
    return {
      defaultCurrency: code,
      byCurrency: [preferred],
      currencies: [code],
      loadError: ec.loadError ?? null,
    };
  }

  const empty: TalentEarnings = {
    ...EMPTY_TALENT_EARNINGS,
    totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: talentDefault },
  };
  return {
    defaultCurrency: talentDefault,
    byCurrency: [empty],
    currencies: [talentDefault],
    loadError: ec.loadError ?? null,
  };
}
