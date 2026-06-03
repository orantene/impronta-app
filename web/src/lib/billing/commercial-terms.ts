/**
 * Commercial-terms resolver + safe parsers (2026-06-03).
 *
 * PURE functions. No DB, no Stripe, no side effects. Mirrors the layered shape
 * of `commission.ts`: the caller pre-loads the platform default, the tenant
 * override (from agencies.settings.commercialTerms), and the talent preference
 * (from talent_profiles.booking_terms); this resolver layers them.
 *
 * CONFIGURATION LAYER ONLY — resolves *settings*. It does not charge a card,
 * create a Stripe object, or alter offer/booking money math. A later wave reads
 * these resolved terms to drive deposits/refunds.
 *
 * ── Layering (most-specific wins, per field) ────────────────────────────────
 *   platform default  →  tenant override (non-null field)  →  talent preference
 *
 *   depositPct     : deepest layer that supplied a non-null value.
 *   refundPolicy   : deepest layer that supplied a non-null value.
 *   instantBook    : NOT a simple override — a workspace switch GATED by talent
 *                    opt-in. Enabled only if the tenant enabled it AND the
 *                    talent opted in. With no talent row, opt-in defaults to
 *                    true (so a workspace toggle alone turns it on); with no
 *                    tenant row, the platform default stands (talent can't
 *                    force it on by themselves).
 *   fixedRateCents : talent-only (the platform/tenant have no such concept).
 *   resolvedFrom   : the deepest layer that supplied depositPct.
 */

import type {
  PlatformCommercialDefaults,
  RefundPolicyKey,
  ResolvedCommercialTerms,
  TalentBookingTerms,
  TenantCommercialTerms,
} from "./commercial-terms-types";

const REFUND_POLICY_KEYS: readonly RefundPolicyKey[] = [
  "tiered",
  "flexible",
  "strict",
  "manual",
];

/** Hard fallback when even the platform row is missing/garbage. */
const PLATFORM_FALLBACK: PlatformCommercialDefaults = {
  defaultDepositPct: 0,
  defaultRefundPolicy: "tiered",
  instantBookDefault: false,
};

function isRefundPolicyKey(v: unknown): v is RefundPolicyKey {
  return typeof v === "string" && (REFUND_POLICY_KEYS as readonly string[]).includes(v);
}

/** Clamp a deposit percentage to the 0..100 range; null/garbage → null. */
function clampDepositPct(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(Math.max(v, 0), 100);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Resolve the effective commercial terms by layering the three config sources.
 * PURE — no IO.
 */
export function resolveCommercialTerms(input: {
  platform: PlatformCommercialDefaults;
  tenant: TenantCommercialTerms | null;
  talent: TalentBookingTerms | null;
}): ResolvedCommercialTerms {
  const { platform, tenant, talent } = input;

  // depositPct: deepest non-null layer wins; track which one supplied it.
  let depositPct = platform.defaultDepositPct;
  let resolvedFrom: ResolvedCommercialTerms["resolvedFrom"] = "platform_default";
  if (tenant?.depositPct != null) {
    depositPct = tenant.depositPct;
    resolvedFrom = "tenant_override";
  }
  if (talent?.depositPct != null) {
    depositPct = talent.depositPct;
    resolvedFrom = "talent_preference";
  }

  // refundPolicy: deepest non-null layer wins (independent of resolvedFrom,
  // which tracks depositPct per the contract).
  let refundPolicy: RefundPolicyKey = platform.defaultRefundPolicy;
  if (tenant?.refundPolicy != null) refundPolicy = tenant.refundPolicy;
  if (talent?.refundPolicy != null) refundPolicy = talent.refundPolicy;

  // instantBook: workspace switch GATED by talent opt-in.
  //   • No tenant row → fall back to the platform default.
  //   • Tenant row present → enabled only if the tenant enabled it AND the
  //     talent opted in (absent talent row defaults opt-in to true).
  let instantBookEnabled: boolean;
  if (tenant == null) {
    instantBookEnabled = platform.instantBookDefault;
  } else {
    const talentOptIn = talent?.instantBookOptIn ?? true;
    instantBookEnabled = tenant.instantBookEnabled === true && talentOptIn === true;
  }

  // fixedRateCents: talent-only.
  const fixedRateCents = talent?.fixedRateCents ?? null;

  return {
    depositPct,
    refundPolicy,
    instantBookEnabled,
    fixedRateCents,
    resolvedFrom,
  };
}

/**
 * Parse the tenant commercial terms out of an agencies.settings jsonb value.
 * Pass the WHOLE settings object (or its "commercialTerms" node — both are
 * tolerated). Returns null when nothing usable is present.
 */
export function parseTenantCommercialTerms(
  settingsJson: unknown,
): TenantCommercialTerms | null {
  if (!isPlainObject(settingsJson)) return null;
  // Accept either the full settings object (look under commercialTerms) or the
  // already-unwrapped node.
  const node = isPlainObject(settingsJson.commercialTerms)
    ? settingsJson.commercialTerms
    : settingsJson;

  const depositPct = clampDepositPct(node.depositPct);
  const refundPolicy = isRefundPolicyKey(node.refundPolicy)
    ? node.refundPolicy
    : null;
  const instantBookEnabled = node.instantBookEnabled === true;

  // If absolutely nothing meaningful is set, treat as "no tenant terms".
  if (depositPct == null && refundPolicy == null && !instantBookEnabled) {
    return null;
  }

  return { depositPct, refundPolicy, instantBookEnabled };
}

/**
 * Parse the talent booking terms out of a talent_profiles.booking_terms jsonb
 * value. Tolerant of missing/garbage; returns null when nothing usable.
 */
export function parseTalentBookingTerms(
  json: unknown,
): TalentBookingTerms | null {
  if (!isPlainObject(json)) return null;

  const depositPct = clampDepositPct(json.depositPct);
  const refundPolicy = isRefundPolicyKey(json.refundPolicy)
    ? json.refundPolicy
    : null;
  const instantBookOptIn = json.instantBookOptIn === true;
  const fixedRateCents =
    typeof json.fixedRateCents === "number" &&
    Number.isFinite(json.fixedRateCents) &&
    json.fixedRateCents >= 0
      ? Math.round(json.fixedRateCents)
      : null;

  if (
    depositPct == null &&
    refundPolicy == null &&
    !instantBookOptIn &&
    fixedRateCents == null
  ) {
    return null;
  }

  return { depositPct, refundPolicy, instantBookOptIn, fixedRateCents };
}

/**
 * Parse the platform commercial defaults from a platform_settings row.
 * Always returns a value — falls back to {0, 'tiered', false} on garbage so
 * the resolver's base layer is never undefined.
 */
export function parsePlatformDefaults(row: unknown): PlatformCommercialDefaults {
  if (!isPlainObject(row)) return { ...PLATFORM_FALLBACK };

  const depositPct = clampDepositPct(row.default_deposit_pct);
  const refundPolicy = isRefundPolicyKey(row.default_refund_policy)
    ? row.default_refund_policy
    : PLATFORM_FALLBACK.defaultRefundPolicy;
  const instantBookDefault = row.instant_book_default === true;

  return {
    defaultDepositPct: depositPct ?? PLATFORM_FALLBACK.defaultDepositPct,
    defaultRefundPolicy: refundPolicy,
    instantBookDefault,
  };
}
