/**
 * Which Tulala fee the public ticket table may state (TUL-1366 follow-up).
 *
 * The table never carries a typed rate. It states what the fee decision in
 * `billing/pass-through-arming.ts` says checkouts charge right now:
 *   on          the per-plan service fee (product_tiers.service_fee_bps): a range
 *               across plans, customer-only, shown to the buyer at checkout.
 *   off         the legacy platform take from platform_commission_config.
 *   unavailable no figure at all: the table is not rendered (fail closed).
 * Pure; the loader that feeds it is in `ticket-fee-rates.server.ts`.
 */
import type { PassThroughDecision } from "@/lib/billing/pass-through-arming";
import { MAX_SERVICE_FEE_BPS } from "@/lib/billing/pass-through-rate";

export type TicketFeeRate = {
  /** Lowest and highest fee across plans, in bps. Equal when every plan pays the same. */
  minBps: number;
  maxBps: number;
  /** True: the buyer pays it on top at checkout (per-plan service fee). False: the legacy take. */
  customerOnly: boolean;
};

function valid(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_SERVICE_FEE_BPS;
}

export function ticketFeeRate(input: {
  decision: PassThroughDecision;
  /** platform_commission_config.default_take_bps, for the legacy model. */
  legacyTakeBps: number | null;
}): TicketFeeRate | null {
  const { decision } = input;
  if (decision.mode === "unavailable") return null;
  if (decision.mode === "off") {
    return valid(input.legacyTakeBps) ? { minBps: input.legacyTakeBps, maxBps: input.legacyTakeBps, customerOnly: false } : null;
  }
  // A plan with no stored fee pays the platform rate (same resolution as the checkout).
  const perPlan = decision.planFeeBps ? Object.values(decision.planFeeBps).filter(valid) : [];
  const all = [...perPlan, decision.platformBps].filter(valid);
  if (all.length === 0) return null;
  return { minBps: Math.min(...all), maxBps: Math.max(...all), customerOnly: true };
}
