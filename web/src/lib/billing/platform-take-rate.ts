/**
 * platform-take-rate.ts — the ONE place a plan tier becomes a platform take rate.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Until 2026-08-30 there were two commission systems with different numbers.
 * The canonical booking engine (`./commission.ts`) resolves the rate from
 * `platform_commission_config`: `plan_tier_bps[plan]` if present, else
 * `default_take_bps`, which migration `20261007000000_commission_talent_protected_split.sql`
 * set to 600 (6%) with a 300 bps client surcharge. No migration has ever written
 * a `"free"` key into `plan_tier_bps`, so Free inherits 6% like every other tier.
 *
 * A second module, `@/lib/bookings/commission`, declared itself "the single
 * source of truth" and carried an entirely different table: free 0, studio 1100,
 * agency 1750, network 1750. It was reachable from real money — the
 * `createBookingTransaction` fallback whenever the commission snapshot produced
 * no fee to pro-rate — and from the workspace financials UI. Because
 * `instant-book-engine` hardcodes `planTier: "agency"` into that call, a booking
 * that reached the fallback was billed 17.5% instead of 6%.
 *
 * That table is gone. This module replaces it, and it reads the same config the
 * canonical resolver reads, so the two can no longer disagree.
 *
 * WHAT THIS IS *NOT*
 * ──────────────────
 * This is the plan-tier layer only — override hierarchy layers 4 and 5 (see
 * `./commission.ts`). It deliberately does NOT apply per-booking, relationship,
 * or tenant overrides. Anything that has a booking in hand must use the full
 * resolver via `persistBookingCommissionSnapshot`, whose snapshot is the true
 * split and what payouts actually read. Use this only where no snapshot exists:
 * a legacy fallback, or a "what rate does this plan pay" display.
 *
 * FAILURE DIRECTION
 * ─────────────────
 * When the config row cannot be read we return `PLATFORM_DEFAULT_TAKE_BPS`, not
 * 0. The old module failed to 0 on the theory that undercharging is safer than
 * overcharging. That reasoning is sound for an *unknown rate* but it was applied
 * to a *known* one, which is how Free ended up exempt and how a display could
 * tell a workspace owner their fee was 0%. 600 is the ratified contract, so it
 * is the honest fallback; genuine per-tenant deviations live in overrides that
 * only the snapshot path can see anyway.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * The ratified platform take, in basis points (600 = 6.00%).
 *
 * Mirrors `platform_commission_config.default_take_bps` as set by
 * `20261007000000_commission_talent_protected_split.sql`. Changing the product's
 * commission is a migration plus a change here, never one without the other.
 */
export const PLATFORM_DEFAULT_TAKE_BPS = 600;

/**
 * The client-side share of the platform take, in basis points.
 *
 * Set to 300 by `20261007000000_commission_talent_protected_split.sql`: of the
 * 600 bps total, 300 is added on top of what the client pays and 300 comes out
 * of the seller's side. Used as the fallback when the config row is unreadable.
 */
export const PLATFORM_DEFAULT_CLIENT_SURCHARGE_BPS = 300;

/** The subset of `platform_commission_config` this module needs. */
export type PlanTakeConfig = {
  default_take_bps: number | null;
  /** Per-tier bps overrides. Empty in every migration to date. */
  plan_tier_bps: Record<string, unknown> | null;
  /** Client-side share of the take, added on top of the client's price. */
  client_surcharge_bps: number | null;
};

/**
 * Plan tier → take bps, pure and synchronous.
 *
 * Precedence matches the canonical resolver's layers 4 then 5: an explicit
 * `plan_tier_bps` entry wins, otherwise the platform default. A tier absent
 * from `plan_tier_bps` is NOT an error and NOT zero — it inherits, which is the
 * whole reason Free is charged today.
 *
 * Tolerates a null config, a null tier, and junk in the JSONB (a hand-edited
 * row, or a tier written as a string). Only a finite, non-negative number is
 * accepted as an override; anything else falls through to the default.
 */
export function resolvePlanTakeBps(
  config: PlanTakeConfig | null | undefined,
  planTier: string | null | undefined,
): number {
  const fallback =
    config && typeof config.default_take_bps === "number" && Number.isFinite(config.default_take_bps)
      ? Math.max(0, Math.round(config.default_take_bps))
      : PLATFORM_DEFAULT_TAKE_BPS;

  const tier = typeof planTier === "string" ? planTier.trim().toLowerCase() : "";
  if (!tier || !config?.plan_tier_bps || typeof config.plan_tier_bps !== "object") {
    return fallback;
  }

  const raw = (config.plan_tier_bps as Record<string, unknown>)[tier];
  const override = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (Number.isFinite(override) && override >= 0) {
    return Math.round(override);
  }
  return fallback;
}

/** Read the singleton config. Returns null when unavailable (caller defaults). */
export async function loadPlanTakeConfig(): Promise<PlanTakeConfig | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("platform_commission_config")
      .select("default_take_bps, plan_tier_bps, client_surcharge_bps")
      .eq("singleton_key", true)
      .maybeSingle();
    if (error || !data) return null;
    return {
      default_take_bps: data.default_take_bps ?? null,
      plan_tier_bps: (data.plan_tier_bps as Record<string, unknown> | null) ?? null,
      client_surcharge_bps: data.client_surcharge_bps ?? null,
    };
  } catch (err) {
    logServerError("billing.loadPlanTakeConfig", err);
    return null;
  }
}

/**
 * Plan tier → take bps, reading live config.
 *
 * Falls back to `PLATFORM_DEFAULT_TAKE_BPS` when the config is unreadable —
 * see the failure-direction note in the module header.
 */
export async function loadPlatformTakeBps(planTier: string | null | undefined): Promise<number> {
  return resolvePlanTakeBps(await loadPlanTakeConfig(), planTier);
}
