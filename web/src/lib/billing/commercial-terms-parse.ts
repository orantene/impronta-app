/**
 * Commercial-terms parsing helpers (2026-06-03).
 *
 * CONFIGURATION LAYER ONLY — pure functions that read/normalise the commercial
 * booking-terms blobs out of jsonb storage into the shared typed shapes. No
 * money flow, charging, or refund execution happens here.
 *
 * Directive-free so it can be imported from server data loaders, server
 * actions, and the pure resolver alike (a "use server" file may export only
 * async functions, so these helpers must live outside one).
 */

import {
  type RefundPolicyKey,
  type TenantCommercialTerms,
} from "./commercial-terms-types";

export type { TenantCommercialTerms, RefundPolicyKey };

const REFUND_POLICY_KEYS: readonly RefundPolicyKey[] = [
  "tiered",
  "flexible",
  "strict",
  "manual",
];

/** Narrow an unknown value to a valid refund-policy key, else null. */
export function asRefundPolicyKey(value: unknown): RefundPolicyKey | null {
  return typeof value === "string" &&
    (REFUND_POLICY_KEYS as readonly string[]).includes(value)
    ? (value as RefundPolicyKey)
    : null;
}

/** Clamp an unknown to a 0–100 deposit percentage, else null. */
export function asDepositPct(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

const EMPTY_TENANT_TERMS: TenantCommercialTerms = {
  depositPct: null,
  refundPolicy: null,
  instantBookEnabled: false,
};

/**
 * Parse the `agencies.settings.commercialTerms` blob into a TenantCommercialTerms.
 * Tolerant: anything missing/invalid collapses to the inherit-from-platform
 * defaults (null deposit, null policy, instant-book off).
 */
export function parseTenantCommercialTerms(raw: unknown): TenantCommercialTerms {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_TENANT_TERMS };
  }
  const o = raw as Record<string, unknown>;
  return {
    depositPct: asDepositPct(o.depositPct),
    refundPolicy: asRefundPolicyKey(o.refundPolicy),
    instantBookEnabled: o.instantBookEnabled === true,
  };
}
