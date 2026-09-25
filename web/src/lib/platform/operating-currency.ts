import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

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

export { applyOperatingCurrencyToEarnings } from "./operating-currency-apply";
