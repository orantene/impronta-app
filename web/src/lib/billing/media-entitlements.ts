/**
 * media-entitlements.ts — the SHAPE of media plan gating. Deliberately toothless.
 *
 * WHAT THIS IS
 * ────────────
 * Plan §8 phase 4 lists "plan-tier hooks (talent storage quotas by
 * Basic/Pro/Portfolio; agency release-with-watermark on Studio+)", and plan §9
 * decision 5 says the pricing behind those hooks "is worth a separate pricing
 * pass before phase 4". Both are true, so this module ships the seam and NOT
 * the numbers: every limit below is unlimited and every feature is available.
 *
 * ONE config object, `MEDIA_ENTITLEMENT_CONFIG`, holds every value a pricing
 * decision would change. Flipping this product on is editing that object and
 * nothing else — there is no second place where a quota is assumed, and no
 * call site does its own arithmetic on plan keys.
 *
 * WHY PERMISSIVE DEFAULTS RATHER THAN A FLAG
 * ──────────────────────────────────────────
 * A flag would leave two code paths, one of them unexercised until launch day.
 * Permissive values mean the real path runs in production from the first
 * commit: the checks execute, the call sites handle their results, and turning
 * pricing on changes data instead of control flow. If the numbers below are
 * wrong, the failure is "we allowed something we meant to charge for" — never
 * "we blocked a paying customer with untested code".
 *
 * PURE on purpose: no `server-only`, no Supabase import. Callers hand it the
 * plan key they already loaded. USD is the only currency this product uses,
 * and nothing here quotes a price anyway.
 */

/** Talent-side plan keys, mirroring `lib/access/talent-membership.ts`. */
export type TalentMediaPlanKey = "talent_basic" | "talent_pro" | "talent_portfolio";

/**
 * Workspace-side plan tiers, mirroring `agencies.plan_tier` as read by
 * `lib/agency/exclusivity-resolver.ts`. Kept as a plain string union rather
 * than an import so a plan-catalog refactor cannot silently change gating.
 */
export type WorkspaceMediaPlanTier =
  | "free"
  | "studio"
  | "agency"
  | "network"
  | "hub-network";

export type MediaStorageQuota = {
  /** null = unlimited. Bytes, so no unit ambiguity at the call site. */
  maxBytes: number | null;
  /** null = unlimited. Counts `media_assets` rows the talent owns. */
  maxAssets: number | null;
};

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TODO(pricing-pass): THE ONLY PLACE MEDIA PRICING DECISIONS BELONG.
 *
 * Every value here is currently the permissive one. A pricing pass replaces
 * numbers in this object; it should not need to touch any other file.
 *
 *   • talentStorage — plan §8: "talent storage quotas by Basic/Pro/Portfolio".
 *     Nothing is measured yet; `null` means unlimited.
 *   • watermarkOnRelease — plan §9.5: "release-with-watermark as Studio+".
 *     Every tier is `true` today, including free.
 *   • releaseRequestsPerMonth — plan §9.5 mentions release-request VOLUME as a
 *     pricing lever. Unmetered today.
 *
 * Do NOT invent prices, byte caps or request caps here without the owner's
 * pricing decision. A wrong number in this object is a silently broken
 * customer, not a lint error.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const MEDIA_ENTITLEMENT_CONFIG = {
  talentStorage: {
    talent_basic: { maxBytes: null, maxAssets: null },
    talent_pro: { maxBytes: null, maxAssets: null },
    talent_portfolio: { maxBytes: null, maxAssets: null },
  } satisfies Record<TalentMediaPlanKey, MediaStorageQuota>,

  watermarkOnRelease: {
    free: true,
    studio: true,
    agency: true,
    network: true,
    "hub-network": true,
  } satisfies Record<WorkspaceMediaPlanTier, boolean>,

  releaseRequestsPerMonth: {
    free: null,
    studio: null,
    agency: null,
    network: null,
    "hub-network": null,
  } satisfies Record<WorkspaceMediaPlanTier, number | null>,
} as const;

/** Unknown / missing plan keys degrade to the most permissive entry. */
const FALLBACK_TALENT_PLAN: TalentMediaPlanKey = "talent_portfolio";
const FALLBACK_WORKSPACE_TIER: WorkspaceMediaPlanTier = "network";

export function normalizeTalentMediaPlanKey(value: unknown): TalentMediaPlanKey {
  return value === "talent_basic" || value === "talent_pro" || value === "talent_portfolio"
    ? value
    : FALLBACK_TALENT_PLAN;
}

export function normalizeWorkspaceMediaPlanTier(value: unknown): WorkspaceMediaPlanTier {
  return value === "free" ||
    value === "studio" ||
    value === "agency" ||
    value === "network" ||
    value === "hub-network"
    ? value
    : FALLBACK_WORKSPACE_TIER;
}

/** Storage allowance for a talent's own uploads. Unlimited until pricing lands. */
export function talentMediaStorageQuota(planKey: unknown): MediaStorageQuota {
  return MEDIA_ENTITLEMENT_CONFIG.talentStorage[normalizeTalentMediaPlanKey(planKey)];
}

export type QuotaVerdict = {
  allowed: boolean;
  /** null when the plan is unmetered. */
  remainingBytes: number | null;
  /** Plain-language reason, ready to show. Empty string when allowed. */
  message: string;
};

/**
 * Would one more upload of `incomingBytes` fit? Call sites are expected to
 * ignore a `true` verdict entirely — it is the `false` branch that will
 * eventually need UI, and wiring it now means it is not written under
 * launch-day pressure.
 */
export function checkTalentStorageAllowance(input: {
  planKey: unknown;
  usedBytes: number;
  incomingBytes: number;
}): QuotaVerdict {
  const quota = talentMediaStorageQuota(input.planKey);
  if (quota.maxBytes === null) {
    return { allowed: true, remainingBytes: null, message: "" };
  }
  const remaining = quota.maxBytes - input.usedBytes;
  if (input.incomingBytes <= remaining) {
    return { allowed: true, remainingBytes: remaining, message: "" };
  }
  return {
    allowed: false,
    remainingBytes: Math.max(0, remaining),
    message: "Your plan's photo storage is full. Remove some photos or upgrade to add more.",
  };
}

export type FeatureVerdict = {
  allowed: boolean;
  /** Plain-language reason, ready to show. Empty string when allowed. */
  message: string;
};

/**
 * May this workspace attach a watermark condition to a release it approves?
 * Permissive on every tier today (plan §9.5 needs the pricing pass first).
 */
export function checkWatermarkOnReleaseEntitlement(planTier: unknown): FeatureVerdict {
  const tier = normalizeWorkspaceMediaPlanTier(planTier);
  if (MEDIA_ENTITLEMENT_CONFIG.watermarkOnRelease[tier]) {
    return { allowed: true, message: "" };
  }
  return {
    allowed: false,
    message: "Releasing photos with a watermark is available on a higher plan.",
  };
}

/** Monthly release-request allowance. null = unmetered (today, every tier). */
export function workspaceReleaseRequestAllowance(planTier: unknown): number | null {
  return MEDIA_ENTITLEMENT_CONFIG.releaseRequestsPerMonth[
    normalizeWorkspaceMediaPlanTier(planTier)
  ];
}
