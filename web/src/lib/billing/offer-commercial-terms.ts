/**
 * Offer commercial terms — pure derivation + normalization (2026-06-03, W6a).
 *
 * PURE functions. No DB, no Stripe, no side effects. Mirrors commercial-terms.ts.
 * Used by the offer engine (to default + persist the 4 offer-term columns) and
 * by display layers (to render the negotiated deposit / balance method / refund
 * policy). DISPLAY + SNAPSHOT only — nothing here charges a card.
 *
 * The four offer-term columns:
 *   deposit_pct numeric, deposit_amount_cents bigint,
 *   balance_collection_method text, refund_policy_key text
 *
 * Invariants enforced by normalizeOfferTerms (the shared contract):
 *   • pay_in_place   → depositPct = 0   (nothing collected online up front)
 *   • full_upfront   → depositPct = 100 (full amount now)
 *   • request_in_messages → any depositPct in 0..100
 */

import { resolveCommercialTerms } from "./commercial-terms";
import { normalizeDepositPct } from "./commercial-terms-types";
import type {
  BalanceCollectionMethod,
  OfferCommercialTerms,
  PlatformCommercialDefaults,
  RefundPolicyKey,
  TalentBookingTerms,
  TenantCommercialTerms,
} from "./commercial-terms-types";

const BALANCE_METHODS: readonly BalanceCollectionMethod[] = [
  "request_in_messages",
  "pay_in_place",
  "full_upfront",
];

const REFUND_POLICY_KEYS: readonly RefundPolicyKey[] = [
  "tiered",
  "flexible",
  "strict",
  "manual",
];

export function isBalanceCollectionMethod(v: unknown): v is BalanceCollectionMethod {
  return typeof v === "string" && (BALANCE_METHODS as readonly string[]).includes(v);
}

export function isRefundPolicyKey(v: unknown): v is RefundPolicyKey {
  return typeof v === "string" && (REFUND_POLICY_KEYS as readonly string[]).includes(v);
}

/** Clamp a deposit percentage to 0..100; null/garbage → null. */
export function clampDepositPct(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(Math.max(v, 0), 100);
}

/**
 * Derive the deposit amount in minor units from a client total (in minor units)
 * and a deposit percentage. round-half-up; never negative; never exceeds total.
 *
 *   deriveDepositAmountCents(100_00, 30) === 30_00
 *   deriveDepositAmountCents(99_99, 50)  === 50_00  (round(4999.5) = 5000)
 */
export function deriveDepositAmountCents(
  totalClientPriceCents: number,
  depositPct: number,
): number {
  if (!Number.isFinite(totalClientPriceCents) || totalClientPriceCents <= 0) return 0;
  const pct = Math.min(Math.max(Number.isFinite(depositPct) ? depositPct : 0, 0), 100);
  const raw = Math.round((totalClientPriceCents * pct) / 100);
  return Math.min(Math.max(raw, 0), Math.round(totalClientPriceCents));
}

/**
 * The default offer terms for a fresh draft, derived from the W5 resolver.
 *   • depositPct   ← resolved deposit %
 *   • refundPolicy ← resolved refund policy
 *   • balanceMethod← inferred: 100% → full_upfront, 0% → request_in_messages
 *                    (a 0% deposit still defaults to "request balance in Messages",
 *                    NOT pay_in_place — pay-in-place is an explicit operator choice).
 * deposit_amount_cents is derived by the caller once the client total is known.
 */
export function defaultOfferTermsFromResolved(input: {
  platform: PlatformCommercialDefaults;
  tenant: TenantCommercialTerms | null;
  talent: TalentBookingTerms | null;
}): { depositPct: number; balanceMethod: BalanceCollectionMethod; refundPolicy: RefundPolicyKey } {
  const resolved = resolveCommercialTerms(input);
  const depositPct = Math.min(Math.max(resolved.depositPct, 0), 100);
  const balanceMethod: BalanceCollectionMethod =
    depositPct >= 100 ? "full_upfront" : "request_in_messages";
  return { depositPct, balanceMethod, refundPolicy: resolved.refundPolicy };
}

/**
 * Normalize a partial/untrusted terms input into a fully-resolved
 * OfferCommercialTerms, enforcing the method→pct invariant and deriving the
 * deposit amount from the client total (in minor units).
 *
 * `fallback` supplies defaults for any missing/garbage field — typically the
 * output of defaultOfferTermsFromResolved.
 */
export function normalizeOfferTerms(
  input: {
    depositPct?: unknown;
    balanceMethod?: unknown;
    refundPolicy?: unknown;
  },
  totalClientPriceCents: number,
  fallback: {
    depositPct: number;
    balanceMethod: BalanceCollectionMethod;
    refundPolicy: RefundPolicyKey;
  },
): OfferCommercialTerms {
  const balanceMethod = isBalanceCollectionMethod(input.balanceMethod)
    ? input.balanceMethod
    : fallback.balanceMethod;
  const refundPolicy = isRefundPolicyKey(input.refundPolicy)
    ? input.refundPolicy
    : fallback.refundPolicy;
  const suppliedPct = clampDepositPct(input.depositPct);
  const basePct = suppliedPct ?? fallback.depositPct;
  const depositPct = normalizeDepositPct(balanceMethod, basePct);
  const depositAmountCents = deriveDepositAmountCents(totalClientPriceCents, depositPct);
  return { depositPct, depositAmountCents, balanceMethod, refundPolicy };
}

/**
 * Read an offer row's 4 term columns into a typed OfferCommercialTerms for
 * display. Returns null when the offer has no terms set (drafted before W6a) so
 * the display layer can fall back to the W5 resolver. deposit_amount_cents is
 * re-derived from the supplied total when the stored value is missing.
 */
export function readOfferTermsFromRow(
  row: {
    deposit_pct?: number | string | null;
    deposit_amount_cents?: number | string | null;
    balance_collection_method?: string | null;
    refund_policy_key?: string | null;
  } | null,
  totalClientPriceCents: number,
): OfferCommercialTerms | null {
  if (!row) return null;
  const balanceMethod = isBalanceCollectionMethod(row.balance_collection_method)
    ? row.balance_collection_method
    : null;
  const refundPolicy = isRefundPolicyKey(row.refund_policy_key)
    ? row.refund_policy_key
    : null;
  const depositPct = clampDepositPct(
    typeof row.deposit_pct === "string" ? Number(row.deposit_pct) : row.deposit_pct,
  );
  // No usable terms at all → caller falls back to the resolver.
  if (balanceMethod == null && refundPolicy == null && depositPct == null) {
    return null;
  }
  const method = balanceMethod ?? "request_in_messages";
  const pct = normalizeDepositPct(method, depositPct ?? 0);
  const storedAmount =
    typeof row.deposit_amount_cents === "string"
      ? Number(row.deposit_amount_cents)
      : row.deposit_amount_cents;
  const depositAmountCents =
    typeof storedAmount === "number" && Number.isFinite(storedAmount) && storedAmount >= 0
      ? Math.round(storedAmount)
      : deriveDepositAmountCents(totalClientPriceCents, pct);
  return {
    depositPct: pct,
    depositAmountCents,
    balanceMethod: method,
    refundPolicy: refundPolicy ?? "tiered",
  };
}
