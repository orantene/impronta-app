import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  type PlatformCommercialDefaults,
  type RefundPolicyKey,
} from "@/lib/billing/commercial-terms-types";
import { asRefundPolicyKey, asDepositPct } from "@/lib/billing/commercial-terms-parse";

/**
 * Platform-wide commercial booking-term defaults (the `platform_settings`
 * singleton). CONFIGURATION LAYER ONLY — these are the base fallback the
 * resolver lands on when neither tenant nor talent set a value. No money flow.
 *
 * Mirrors operating-currency.ts: the raw `.from("platform_settings")` reads and
 * writes live in this server-only lib (platform_settings has no tenant_id, so it
 * stays out of the action files that the no-untenanted-from ratchet guards). New
 * columns are asserted via `.returns<T>()` because database.types.ts is not being
 * regenerated this wave (a known repo gotcha — otherwise they widen to
 * GenericStringError).
 */

const DEFAULT_COMMERCIAL_DEFAULTS: PlatformCommercialDefaults = {
  defaultDepositPct: 0,
  defaultRefundPolicy: "tiered",
  instantBookDefault: false,
};

type PlatformCommercialRow = {
  default_deposit_pct: number | string | null;
  default_refund_policy: string | null;
  instant_book_default: boolean | null;
};

export const loadPlatformCommercialDefaults = cache(
  async (): Promise<PlatformCommercialDefaults> => {
    try {
      const admin = createServiceRoleClient();
      if (!admin) return { ...DEFAULT_COMMERCIAL_DEFAULTS };
      const { data } = await admin
        .from("platform_settings")
        .select("default_deposit_pct, default_refund_policy, instant_book_default")
        .eq("id", true)
        .maybeSingle()
        .returns<PlatformCommercialRow>();
      if (!data) return { ...DEFAULT_COMMERCIAL_DEFAULTS };
      const rawPct =
        typeof data.default_deposit_pct === "string"
          ? Number(data.default_deposit_pct)
          : data.default_deposit_pct;
      return {
        defaultDepositPct: asDepositPct(rawPct) ?? 0,
        defaultRefundPolicy:
          asRefundPolicyKey(data.default_refund_policy) ?? "tiered",
        instantBookDefault: !!data.instant_book_default,
      };
    } catch (err) {
      logServerError("platform.loadCommercialDefaults", err);
      return { ...DEFAULT_COMMERCIAL_DEFAULTS };
    }
  },
);

export async function writePlatformCommercialDefaults(
  updatedBy: string,
  input: {
    defaultDepositPct: number;
    defaultRefundPolicy: RefundPolicyKey;
    instantBookDefault: boolean;
  },
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
    const { error } = await admin
      .from("platform_settings")
      .update({
        default_deposit_pct: input.defaultDepositPct,
        default_refund_policy: input.defaultRefundPolicy,
        instant_book_default: input.instantBookDefault,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("id", true);
    if (error) {
      logServerError("platform.writeCommercialDefaults", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeCommercialDefaults", err);
    return { ok: false };
  }
}
