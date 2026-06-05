/**
 * lib/payments/payout-rail-policy.ts
 *
 * Decides which payout rail a talent's booking leg settles on:
 *   • "global_payouts"   — v2 OutboundPayment (USDC / worldwide) — ONLY when the
 *     talent opted in, the platform has Global Payouts active, and their country
 *     is stablecoin-eligible.
 *   • "connect_transfer" — the default Connect rail, in every other case.
 *
 * The decision is a pure function (unit-testable); the DB-backed resolver reads
 * the opt-in flag first and SHORT-CIRCUITS to Connect before any Stripe API call,
 * so the common (non-USDC) payout pays no extra latency.
 *
 * Server-only.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isGlobalPayoutsActive } from "./global-payouts";
import { isStablecoinPayoutCountry } from "./payout-countries";
import type { PayoutRail } from "./disburse";

export type PayoutRailDecision = { rail: PayoutRail; reason: string };

/**
 * Pure rail decision. Global Payouts only when ALL three hold; otherwise Connect.
 */
export function decidePayoutRail(input: {
  gpActive: boolean;
  countryEligible: boolean;
  talentCryptoOptIn: boolean;
}): PayoutRailDecision {
  if (!input.talentCryptoOptIn) {
    return { rail: "connect_transfer", reason: "no USDC opt-in → Connect rail" };
  }
  if (!input.gpActive) {
    return { rail: "connect_transfer", reason: "opted in, but Global Payouts not active yet → Connect rail" };
  }
  if (!input.countryEligible) {
    return { rail: "connect_transfer", reason: "opted in, but country not stablecoin-eligible → Connect rail" };
  }
  return { rail: "global_payouts", reason: "opted in + eligible country + GP active → Global Payouts (USDC)" };
}

export type RailResolverDeps = {
  /** Injected Supabase client (tests / reuse the caller's). */
  sb?: SupabaseClient | null;
  /** Injected GP-active check (tests). */
  gpActive?: () => Promise<boolean>;
};

/**
 * Resolve the rail for a talent from persisted state. Short-circuits to Connect
 * on the common path (no opt-in) before any Stripe call. Test-safe via injected
 * deps.
 */
export async function resolveTalentPayoutRail(
  talentProfileId: string,
  deps: RailResolverDeps = {},
): Promise<PayoutRail> {
  const sb = deps.sb ?? createServiceRoleClient();
  if (!sb) return "connect_transfer";

  const { data: tp } = await sb
    .from("talent_profiles")
    .select("crypto_payouts_enabled, residence_country_id")
    .eq("id", talentProfileId)
    .maybeSingle();

  // Common path: not opted in → Connect, no Stripe API call.
  if (!tp?.crypto_payouts_enabled) return "connect_transfer";

  const gpActive = await (deps.gpActive ?? isGlobalPayoutsActive)();
  if (!gpActive) return "connect_transfer";

  let iso2: string | null = null;
  if (tp.residence_country_id) {
    const { data: c } = await sb
      .from("countries")
      .select("iso2")
      .eq("id", tp.residence_country_id as string)
      .maybeSingle();
    iso2 = (c?.iso2 as string | null) ?? null;
  }

  return decidePayoutRail({
    gpActive: true,
    countryEligible: isStablecoinPayoutCountry(iso2),
    talentCryptoOptIn: true,
  }).rail;
}
