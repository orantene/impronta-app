/**
 * The talent subscription tier LABEL — one switch-aware resolver.
 *
 * Founder decision 2026-09-23 (Pro fold + rename): there is one paid talent
 * tier and it is called "Web Office". `talent_pro` is grandfathered but never
 * sold or shown as its own tier again. The plan KEYS, prices, ranks and Stripe
 * ids are untouched; this file only decides what a human reads.
 *
 * Why the rename is behind `TALENT_FREE_WEBSITE_ENABLED`: Phase 1 ships dark.
 * While the switch is off, nothing about the free website exists yet, so
 * calling the paid tier "Web Office" would advertise an office that is not
 * open. With the switch off this resolver returns the legacy labels ("Free" /
 * "Pro" / "Portfolio") and the product reads exactly as it did before Phase 1.
 *
 * SERVER-SIDE ONLY, by construction. `process.env.TALENT_FREE_WEBSITE_ENABLED`
 * is not a `NEXT_PUBLIC_*` variable, so a client bundle would inline it as
 * undefined and hydrate a different label than the server rendered. Every
 * consumer here is a server module (`talent-membership.ts`, `plan-catalog.ts`,
 * `talent-self-guard.ts`); client components receive the RESOLVED label as
 * data, they never call these functions themselves.
 */
import { isTalentFreeWebsiteEnabled } from "./talent-free-website";

/** The tier buckets the talent UI groups plans into. */
export type TalentTierLabelTier = "free" | "pro" | "max";

/** The one paid tier's label once the free website is live. */
export const TALENT_PAID_TIER_LABEL = "Web Office";
/** What the paid tier was called before the fold, and still is while dark. */
export const TALENT_PAID_TIER_LABEL_LEGACY = "Portfolio";
/** The folded middle tier's legacy label, still shown while dark. */
export const TALENT_PRO_TIER_LABEL_LEGACY = "Pro";
/** The free tier's label. Unchanged by the fold. */
export const TALENT_FREE_TIER_LABEL = "Free";

/**
 * True once the paid tier is presented as "Web Office".
 *
 * Scope note: this governs the LABEL only. The Pro fold itself — `talent_pro`
 * no longer being sold, and the compare drawer showing two columns — is
 * unconditional, because those surfaces are client components and
 * `TALENT_FREE_WEBSITE_ENABLED` is not a `NEXT_PUBLIC_*` variable, so a
 * client-side read of it would disagree with the server and hydrate wrong.
 */
export function isTalentTierRenameEnabled(): boolean {
  return isTalentFreeWebsiteEnabled();
}

/**
 * The label a talent reads for a tier bucket. Tier labels are product names,
 * so they are identical in en and es (the es dashboard dictionary may still
 * translate the free tier as "Gratis" at its own call site).
 */
export function talentTierLabel(tier: TalentTierLabelTier): string {
  if (tier === "free") return TALENT_FREE_TIER_LABEL;
  if (isTalentTierRenameEnabled()) return TALENT_PAID_TIER_LABEL;
  return tier === "pro" ? TALENT_PRO_TIER_LABEL_LEGACY : TALENT_PAID_TIER_LABEL_LEGACY;
}

/** The label of the tier a talent upgrades TO. */
export function talentPaidTierLabel(): string {
  return talentTierLabel("max");
}

/**
 * Fill `{tier}` in a copy template with the resolved paid-tier label, so one
 * sentence serves both switch positions instead of two drifting copies.
 *
 *   withTalentPaidTierLabel("Upgrade to {tier} to add pages.")
 *     switch on  -> "Upgrade to Web Office to add pages."
 *     switch off -> "Upgrade to Portfolio to add pages."
 */
export function withTalentPaidTierLabel(template: string): string {
  return template.split("{tier}").join(talentPaidTierLabel());
}
