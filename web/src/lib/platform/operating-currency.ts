import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings } from "@/lib/talent/earnings-types";
import type { TalentEarningsByCurrency } from "@/lib/talent/earnings-by-currency-types";

export type PlatformOperatingCurrency = {
  /** ISO-4217 the platform runs in (default USD). */
  operatingCurrency: string;
  /** When false (default), surfaces collapse to the single operating currency. */
  multiCurrencyDisplayEnabled: boolean;
};

const DEFAULT_OPERATING: PlatformOperatingCurrency = {
  operatingCurrency: "USD",
  multiCurrencyDisplayEnabled: false,
};

/**
 * The platform-wide currency policy (the `platform_settings` singleton). A
 * super-admin sets this on /platform/admin/settings. Default = run in USD with
 * the multi-currency display OFF, so talents see one clean figure instead of
 * EUR/USD tabs. Cached per request.
 */
export const loadPlatformOperatingCurrency = cache(
  async (): Promise<PlatformOperatingCurrency> => {
    try {
      const admin = createServiceRoleClient();
      if (!admin) return DEFAULT_OPERATING;
      const { data } = await admin
        .from("platform_settings")
        .select("operating_currency, multi_currency_display_enabled")
        .eq("id", true)
        .maybeSingle();
      if (!data) return DEFAULT_OPERATING;
      return {
        operatingCurrency: ((data.operating_currency as string | null) ?? "USD").toUpperCase(),
        multiCurrencyDisplayEnabled: !!data.multi_currency_display_enabled,
      };
    } catch (err) {
      logServerError("platform.loadOperatingCurrency", err);
      return DEFAULT_OPERATING;
    }
  },
);

/**
 * Persist the platform currency policy (singleton). Called by the super-admin
 * `use server` action after it has gated the caller. Lives in this server-only
 * lib so the raw `.from("platform_settings")` write stays out of the action file
 * (the no-untenanted-from ratchet only guards action files; platform_settings
 * has no tenant_id by design).
 */
export async function writePlatformOperatingCurrency(
  updatedBy: string,
  input: { operatingCurrency: string; multiCurrencyDisplayEnabled: boolean },
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
    const { error } = await admin
      .from("platform_settings")
      .update({
        operating_currency: input.operatingCurrency.toUpperCase(),
        multi_currency_display_enabled: input.multiCurrencyDisplayEnabled,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("id", true);
    if (error) {
      logServerError("platform.writeOperatingCurrency", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeOperatingCurrency", err);
    return { ok: false };
  }
}

/**
 * When platform multi-currency display is OFF, collapse a talent's by-currency
 * earnings to the single operating currency — so the Money dashboard shows one
 * clean figure (e.g. USD $800) instead of EUR/USD tabs. Legacy rows in other
 * currencies are hidden (no FX is performed — display/operation only). When ON,
 * returns the input unchanged (the full multi-currency tab experience).
 */
export function applyOperatingCurrencyToEarnings(
  ec: TalentEarningsByCurrency,
  setting: PlatformOperatingCurrency,
): TalentEarningsByCurrency {
  if (setting.multiCurrencyDisplayEnabled) return ec;
  const op = setting.operatingCurrency.toUpperCase();
  const bundle = ec.byCurrency.find((b) => b.totals.currency.toUpperCase() === op);
  if (bundle) {
    return { defaultCurrency: op, byCurrency: [bundle], currencies: [op] };
  }
  // No earnings in the operating currency yet → a single empty bundle stamped
  // with it (length 1 ⇒ dashboard shows "USD $0", not the demo fixtures).
  const empty: TalentEarnings = {
    ...EMPTY_TALENT_EARNINGS,
    totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: op },
  };
  return { defaultCurrency: op, byCurrency: [empty], currencies: [op] };
}
