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
 * THE ONLY PLACE MEDIA PRICING DECISIONS BELONG.
 *
 * Every number below traces to an accepted decision in
 * `web/docs/media-pricing-pass-2026-08-15.md` (owner-accepted 2026-08-15).
 * Do NOT change a value here without amending that doc first — the tripwire
 * in `lib/media/phase4-policy.test.ts` asserts these exact numbers and will
 * go red on an undocumented edit. A wrong number in this object is a
 * silently broken customer, not a lint error.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const MEDIA_ENTITLEMENT_CONFIG = {
  /**
   * Talent storage — doc §3a. COUNT-BASED, deliberately.
   *
   * `maxAssets` is an abuse backstop, not a product line: the largest real
   * portfolio on the platform is 108 photos, so Basic's 150 clears today's
   * outlier by 39% and the p90 real talent (52 photos) by 2.9x. Zero current
   * talents are blocked by these caps. A cap that bites the p90 would be a
   * tax on the best users, and with 153 of 159 talents on Basic it would be a
   * tax on essentially everyone.
   *
   * `maxBytes` STAYS null on every tier, and that is a decision rather than an
   * omission (doc §3a "Blocking dependency" + §5d). Nothing stores real
   * originals yet: the largest recorded asset is 470 KB and `media-originals`
   * holds 15 objects, so everything measurable today is a web derivative. On
   * top of that, 23% of the bucket (381 objects / 81.2 MB) has no live
   * `media_assets` row because soft delete does not free storage. A byte
   * quota read from `media_assets` would let a delete-and-reupload loop burn
   * unbounded real storage; one read from `storage.objects` would bill people
   * for photos they deleted. Both are wrong. `maxBytes` stays null until a
   * storage reaper exists AND originals retention is real.
   */
  talentStorage: {
    talent_basic: { maxBytes: null, maxAssets: 150 },
    talent_pro: { maxBytes: null, maxAssets: 600 },
    talent_portfolio: { maxBytes: null, maxAssets: null },
  } satisfies Record<TalentMediaPlanKey, MediaStorageQuota>,

  /**
   * Watermark on release — doc §3b. FREE ON EVERY TIER. Not a paywall.
   *
   * Zero releases have ever happened (`media_grants` = 0,
   * `talent_agency_permission_requests` = 0), so gating this cannot produce
   * revenue — it can only suppress the first use, which is the thing we need
   * in order to learn whether the release flow works at all. Only 4 of 32
   * workspaces are on a paid tier, so a Studio+ gate would lock out 28
   * workspaces that have never tried it. And the watermark is what turns an
   * agency's "no" into "yes, marked": gating the mark deletes the middle
   * option. It also protects the TALENT, who is not the party being billed.
   *
   * If a Studio+ media differentiator is ever needed, the split is branded vs
   * plain (a new `brandedWatermarkOnRelease` key), never this one. Revisit
   * after 50 real releases.
   */
  watermarkOnRelease: {
    free: true,
    studio: true,
    agency: true,
    network: true,
    "hub-network": true,
  } satisfies Record<WorkspaceMediaPlanTier, boolean>,

  /**
   * Release-request volume — doc §3c. NO CAP, on purpose.
   *
   * Zero release requests have ever been created. A cap here would be a
   * number invented from nothing, gating a feature nobody has used. Instead
   * `api/cron/usage-audit` counts release requests (per tenant over a rolling
   * 30 days, and platform-wide per month) so the revisit triggers below are
   * observable. Build the cap when either fires:
   *   • any single workspace exceeds 100 release requests in 30 days, or
   *   • platform-wide release requests exceed 1,000 in a month.
   * The counter is what makes the eventual cap defensible instead of invented.
   */
  releaseRequestsPerMonth: {
    free: null,
    studio: null,
    agency: null,
    network: null,
    "hub-network": null,
  } satisfies Record<WorkspaceMediaPlanTier, number | null>,
} as const;

/**
 * Fraction of the asset cap at which a talent is warned but NOT blocked
 * (doc §3a "What happens at the limit", step 1). One home for the threshold
 * so the warn line cannot drift from the block line.
 */
export const MEDIA_QUOTA_SOFT_WARN_RATIO = 0.8;

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
 * Would one more upload of `incomingBytes` fit?
 *
 * NOTE: this reads `maxBytes` ONLY, and `maxBytes` is null on every plan by
 * decision (see the config comment above). So this function allows everything
 * today, and that is correct. The cap that actually bites is the COUNT cap —
 * `checkTalentAssetCountAllowance` below. Do not mistake a `true` verdict from
 * here for "the talent is under quota"; call sites must check the count too.
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

/**
 * Verdict for the COUNT cap. A sibling of `QuotaVerdict` rather than a reuse of
 * it: `remainingBytes` would be an actively misleading field name for a row
 * count, and this verdict also carries a soft-warn state that the byte check
 * has no concept of.
 */
export type AssetCountVerdict = {
  /** false = refuse the upload. Never "downscale it" and never "drop it". */
  allowed: boolean;
  /** null when the plan is uncapped (Portfolio). */
  remainingAssets: number | null;
  /**
   * True when the upload is allowed but lands the talent at or past
   * `MEDIA_QUOTA_SOFT_WARN_RATIO` of their cap. Show `message`; do not block.
   */
  warn: boolean;
  /**
   * Plain-language and ready to show, in English. Empty when there is nothing
   * to say. Clients that localize should branch on `code` instead and fall
   * back to this string.
   */
  message: string;
  /** Stable, localizable discriminator. */
  code: "ok" | "approaching_limit" | "limit_reached";
};

/**
 * Would `incomingAssets` more photos fit under the talent's plan count cap?
 *
 * Behaviour is doc §3a "What happens at the limit":
 *   • soft warn at 80% of the cap, still allowed;
 *   • block at 100%, before the `media_assets` insert;
 *   • never auto-downscale and never silently drop (the ownership model this
 *     whole program exists to establish says the talent owns their uploads);
 *   • never retro-block. Someone already over a cap keeps every photo they
 *     have and simply cannot add more, which is what refusing only the ADD
 *     gives us for free.
 *
 * Pure, like the rest of this module: the caller passes the plan key and the
 * live count it already read.
 */
export function checkTalentAssetCountAllowance(input: {
  planKey: unknown;
  usedAssets: number;
  incomingAssets: number;
}): AssetCountVerdict {
  const quota = talentMediaStorageQuota(input.planKey);
  if (quota.maxAssets === null) {
    // Portfolio, or an unknown plan key degrading to the permissive entry.
    return { allowed: true, remainingAssets: null, warn: false, message: "", code: "ok" };
  }

  const cap = quota.maxAssets;
  const used = Math.max(0, input.usedAssets);
  const incoming = Math.max(0, input.incomingAssets);
  const remainingBefore = Math.max(0, cap - used);

  if (used + incoming > cap) {
    return {
      allowed: false,
      remainingAssets: remainingBefore,
      warn: false,
      code: "limit_reached",
      message:
        remainingBefore === 0
          ? `You have reached your plan's limit of ${cap} photos. Remove a few photos you no longer need, or upgrade your plan to add more.`
          : `Your plan holds ${cap} photos and you have room for ${remainingBefore} more. Upload fewer photos, remove a few you no longer need, or upgrade your plan.`,
    };
  }

  const remainingAfter = cap - (used + incoming);
  const warn = used + incoming >= Math.floor(cap * MEDIA_QUOTA_SOFT_WARN_RATIO);
  return {
    allowed: true,
    remainingAssets: remainingAfter,
    warn,
    code: warn ? "approaching_limit" : "ok",
    message: warn
      ? `You have room for ${remainingAfter} more ${remainingAfter === 1 ? "photo" : "photos"} on your plan. Remove photos you no longer need, or upgrade for more space.`
      : "",
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
