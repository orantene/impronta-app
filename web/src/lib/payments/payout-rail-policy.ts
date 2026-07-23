/**
 * lib/payments/payout-rail-policy.ts
 *
 * Decides which payout rail a talent's booking leg settles on:
 *   • "connect_transfer" — the existing Connect rail (stripe.transfers.create).
 *     This is the default AND the USDC/stablecoin rail: a talent who self-serves
 *     a crypto wallet + sets USDC as their Express default currency receives USDC
 *     because the SAME USD Connect transfer auto-converts at Stripe — no separate
 *     platform rail or capability is involved (confirmed by Stripe). So a crypto
 *     opt-in routes here, NOT to v2 OutboundPayments.
 *   • "global_payouts"   — the v2 OutboundPayment rail (Stripe Money Movement).
 *     Reserved for NON-USDC local-bank payouts in countries the Connect transfer
 *     rail can't reach. The resolver below never selects it for the crypto opt-in;
 *     it stays available for that bank-payout path.
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
import {
  loadActivePayoutSystem,
  type ActivePayoutSystem,
} from "./active-payout-system";
import type { PayoutRail } from "./disburse";

export type PayoutRailDecision = { rail: PayoutRail; reason: string };

/**
 * Pure rail decision.
 *
 * USDC correction (2026-06): a talent's `crypto_payouts_enabled` opt-in routes to
 * 'connect_transfer', NOT v2 'global_payouts'. USDC rides the existing Connect
 * Transfers API — the USD transfer auto-converts to USDC at Stripe when the talent
 * has linked a crypto wallet + set USDC as their Express default currency, so the
 * crypto opt-in needs no separate rail. The v2 'global_payouts' rail stays reserved
 * for NON-USDC local-bank payouts (selected elsewhere), never for the crypto opt-in.
 *
 * The platform master switch still wins first: when the platform is on Connect,
 * EVERY leg settles via Connect. The remaining conditions (gpActive / countryEligible)
 * are kept as inputs for back-compat but no longer steer the crypto opt-in to v2 —
 * every branch below resolves to 'connect_transfer'.
 */
export function decidePayoutRail(input: {
  /** Platform master switch. Omitted/`"global_payouts"` keeps the legacy logic. */
  activePayoutSystem?: ActivePayoutSystem;
  gpActive: boolean;
  countryEligible: boolean;
  talentCryptoOptIn: boolean;
}): PayoutRailDecision {
  if (input.activePayoutSystem === "connect") {
    return { rail: "connect_transfer", reason: "platform switch = Connect → Connect rail" };
  }
  if (!input.talentCryptoOptIn) {
    return { rail: "connect_transfer", reason: "no USDC opt-in → Connect rail" };
  }
  if (!input.gpActive) {
    return { rail: "connect_transfer", reason: "opted in, but Global Payouts not active yet → Connect rail" };
  }
  if (!input.countryEligible) {
    return { rail: "connect_transfer", reason: "opted in, but country not stablecoin-eligible → Connect rail" };
  }
  // USDC opt-in, eligible country, GP active: still Connect. USDC auto-converts on
  // the Connect transfer (no v2 OutboundPayment), so the crypto opt-in never routes
  // to global_payouts. The v2 rail remains available for the non-USDC bank path.
  return { rail: "connect_transfer", reason: "USDC opt-in → Connect rail (USD transfer auto-converts to USDC)" };
}

export type RailResolverDeps = {
  /** Injected Supabase client (tests / reuse the caller's). */
  sb?: SupabaseClient | null;
  /** Injected GP-active check (tests). */
  gpActive?: () => Promise<boolean>;
  /** Injected platform payout-system switch (tests). */
  activePayoutSystem?: () => Promise<ActivePayoutSystem>;
};

/**
 * Resolve the rail for a talent from persisted state. The platform master switch
 * is read FIRST and short-circuits to Connect before any DB/Stripe call when the
 * platform is on Connect — so a stale per-talent `crypto_payouts_enabled` can never
 * override it. Otherwise short-circuits to Connect on the common path (no opt-in)
 * before any Stripe call.
 *
 * USDC correction (2026-06): a `crypto_payouts_enabled` talent now also resolves to
 * 'connect_transfer' — USDC auto-converts on the Connect transfer, so the crypto
 * opt-in no longer routes to v2 global_payouts. The `gpActive`/country checks below
 * are preserved for back-compat but every branch ends at Connect (see decidePayoutRail).
 * Test-safe via injected deps.
 */
export async function resolveTalentPayoutRail(
  talentProfileId: string,
  deps: RailResolverDeps = {},
): Promise<PayoutRail> {
  const sb = deps.sb ?? createServiceRoleClient();
  if (!sb) return "connect_transfer";

  // Platform master switch wins first — Connect mode force-pins every payout.
  const activePayoutSystem = await (deps.activePayoutSystem ?? loadActivePayoutSystem)();
  if (activePayoutSystem === "connect") return "connect_transfer";

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
