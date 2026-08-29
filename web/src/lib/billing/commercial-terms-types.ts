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
  /** Talent half of the appointments AND-gate. Merged; never clobber siblings. */
  directBookingOptIn?: boolean;
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

/**
 * i18n catalog-key siblings for the refund-policy maps (additive, non-breaking).
 * Localized consumers with a `useT()` render `t(REFUND_POLICY_LABEL_KEYS[key])` /
 * `t(REFUND_POLICY_DESCRIPTION_KEYS[key])` instead of the raw English maps above;
 * non-localized consumers (e.g. platform-admin) keep using REFUND_POLICY_LABELS /
 * REFUND_POLICY_DESCRIPTIONS directly. Keys live under `dashboard.enums.*`.
 */
export const REFUND_POLICY_LABEL_KEYS: Record<RefundPolicyKey, string> = {
  tiered: "dashboard.enums.refundPolicy.tiered",
  flexible: "dashboard.enums.refundPolicy.flexible",
  strict: "dashboard.enums.refundPolicy.strict",
  manual: "dashboard.enums.refundPolicy.manual",
};

export const REFUND_POLICY_DESCRIPTION_KEYS: Record<RefundPolicyKey, string> = {
  tiered: "dashboard.enums.refundPolicyDesc.tiered",
  flexible: "dashboard.enums.refundPolicyDesc.flexible",
  strict: "dashboard.enums.refundPolicyDesc.strict",
  manual: "dashboard.enums.refundPolicyDesc.manual",
};

// ── W6a: offer-level negotiated commercial terms ────────────────────────────
// These describe the terms NEGOTIATED on a single offer (the admin/talent
// composer sets them, the client + talent see them, convert snapshots them onto
// the booking). Display + snapshot only this wave — nothing charges the deposit.

/**
 * How the balance (the part NOT collected as a deposit) is collected.
 *   • request_in_messages — a deposit may be taken now; the balance is requested
 *     in Messages before the event. Allows depositPct 0..100.
 *   • pay_in_place        — nothing is collected online up front (depositPct = 0);
 *     the client pays in person / on the day.
 *   • full_upfront        — the full amount is charged now (depositPct = 100).
 */
export type BalanceCollectionMethod =
  | "request_in_messages"
  | "pay_in_place"
  | "full_upfront";

/**
 * The fully-resolved commercial terms attached to one offer.
 *   • depositPct          — 0..100. Implied by balanceMethod for pay_in_place(0)
 *                            and full_upfront(100); free for request_in_messages.
 *   • depositAmountCents   — DERIVED server-side = round(totalClientPriceCents *
 *                            depositPct / 100). Display + snapshot only.
 *   • balanceMethod        — see BalanceCollectionMethod.
 *   • refundPolicy         — one of the four shared presets.
 */
export type OfferCommercialTerms = {
  depositPct: number;
  depositAmountCents: number;
  balanceMethod: BalanceCollectionMethod;
  refundPolicy: RefundPolicyKey;
};

/** Human-readable labels for each balance-collection method (UI dropdowns). */
export const BALANCE_METHOD_LABELS: Record<BalanceCollectionMethod, string> = {
  request_in_messages: "Deposit now, balance in Messages",
  pay_in_place: "Pay in person",
  full_upfront: "Full amount now",
};

/** One-line descriptions of each balance-collection method (UI helper text). */
export const BALANCE_METHOD_DESCRIPTIONS: Record<BalanceCollectionMethod, string> = {
  request_in_messages:
    "Deposit now; the balance is requested in Messages before the event",
  pay_in_place: "No deposit online — paid in person/on the day",
  full_upfront: "Full amount charged now",
};

/**
 * i18n catalog-key siblings for the balance-method maps (additive, non-breaking).
 * Localized consumers with a `useT()` render `t(BALANCE_METHOD_LABEL_KEYS[m])` /
 * `t(BALANCE_METHOD_DESCRIPTION_KEYS[m])`; non-localized consumers keep the raw
 * English maps above. Keys live under `dashboard.enums.*`.
 */
export const BALANCE_METHOD_LABEL_KEYS: Record<BalanceCollectionMethod, string> = {
  request_in_messages: "dashboard.enums.balanceMethod.request_in_messages",
  pay_in_place: "dashboard.enums.balanceMethod.pay_in_place",
  full_upfront: "dashboard.enums.balanceMethod.full_upfront",
};

export const BALANCE_METHOD_DESCRIPTION_KEYS: Record<BalanceCollectionMethod, string> = {
  request_in_messages: "dashboard.enums.balanceMethodDesc.request_in_messages",
  pay_in_place: "dashboard.enums.balanceMethodDesc.pay_in_place",
  full_upfront: "dashboard.enums.balanceMethodDesc.full_upfront",
};

/**
 * Normalise a deposit % against a balance method. The composer preview and the
 * server-side derive both call this so the displayed and persisted deposit
 * always agree:
 *   • pay_in_place  → 0   (nothing collected online up front)
 *   • full_upfront  → 100 (the whole total is the "deposit")
 *   • otherwise     → clamp 0..100, rounded
 */
export function normalizeDepositPct(
  balanceMethod: BalanceCollectionMethod,
  depositPct: number,
): number {
  if (balanceMethod === "pay_in_place") return 0;
  if (balanceMethod === "full_upfront") return 100;
  if (!Number.isFinite(depositPct)) return 0;
  return Math.max(0, Math.min(100, Math.round(depositPct)));
}
