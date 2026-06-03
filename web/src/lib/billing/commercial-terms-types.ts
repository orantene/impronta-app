/**
 * Commercial-terms configuration — shared plain types (2026-06-03).
 *
 * CONFIGURATION LAYER ONLY. These types describe the *settings* for commercial
 * booking terms (deposit %, refund policy preset, instant-book). They do NOT
 * drive any money flow, charging, or refund execution — that is a later wave.
 *
 * This module is directive-free (no "use server") so it can be imported from
 * server actions, client components, and the pure resolver alike.
 *
 * Storage contract:
 *   • TENANT   → agencies.settings jsonb under "commercialTerms" → TenantCommercialTerms
 *   • TALENT   → talent_profiles.booking_terms jsonb            → TalentBookingTerms
 *   • PLATFORM → platform_settings.default_deposit_pct / default_refund_policy /
 *                instant_book_default                            → PlatformCommercialDefaults
 */

/** The four shared refund-policy presets. */
export type RefundPolicyKey = "tiered" | "flexible" | "strict" | "manual";

/** Per-tenant (workspace) commercial overrides. A null field = "inherit". */
export type TenantCommercialTerms = {
  depositPct: number | null;
  refundPolicy: RefundPolicyKey | null;
  instantBookEnabled: boolean;
};

/** Per-talent booking preferences. A null field = "inherit". */
export type TalentBookingTerms = {
  depositPct: number | null;
  refundPolicy: RefundPolicyKey | null;
  instantBookOptIn: boolean;
  fixedRateCents: number | null;
};

/** Platform-wide base defaults (the deepest fallback layer). */
export type PlatformCommercialDefaults = {
  defaultDepositPct: number;
  defaultRefundPolicy: RefundPolicyKey;
  instantBookDefault: boolean;
};

/** Fully-resolved terms after layering platform → tenant → talent. */
export type ResolvedCommercialTerms = {
  depositPct: number;
  refundPolicy: RefundPolicyKey;
  instantBookEnabled: boolean;
  fixedRateCents: number | null;
  resolvedFrom: "platform_default" | "tenant_override" | "talent_preference";
};

/** Human-readable labels for each preset (UI dropdowns, summaries). */
export const REFUND_POLICY_LABELS: Record<RefundPolicyKey, string> = {
  tiered: "Tiered",
  flexible: "Flexible",
  strict: "Strict",
  manual: "Manual",
};

/** One-line descriptions of each preset (UI helper text). */
export const REFUND_POLICY_DESCRIPTIONS: Record<RefundPolicyKey, string> = {
  tiered:
    "Full refund 14+ days out, 50% at 7–14 days, none under 7 days; deposit non-refundable",
  flexible: "Full refund up to 48h before, none after",
  strict:
    "Deposit non-refundable; 50% balance under 30 days, none under 7",
  manual: "Admin decides each refund manually",
};
