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
/** Spanish product name for the paid tier (TUL-146 — matches dashboard-i18n). */
export const TALENT_PAID_TIER_LABEL_ES = "Oficina Web";
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
 * The label a talent reads for a tier bucket.
 * When the rename is on, ES uses "Oficina Web" (TUL-146) so refusal copy and
 * chips match the dashboard dictionary instead of leaking "Web Office".
 */
export function talentTierLabel(
  tier: TalentTierLabelTier,
  locale?: string | null,
): string {
  if (tier === "free") return TALENT_FREE_TIER_LABEL;
  if (isTalentTierRenameEnabled()) {
    return locale === "es" ? TALENT_PAID_TIER_LABEL_ES : TALENT_PAID_TIER_LABEL;
  }
  return tier === "pro" ? TALENT_PRO_TIER_LABEL_LEGACY : TALENT_PAID_TIER_LABEL_LEGACY;
}

/** The label of the tier a talent upgrades TO. */
export function talentPaidTierLabel(locale?: string | null): string {
  return talentTierLabel("max", locale);
}

/**
 * Fill `{tier}` in a copy template with the resolved paid-tier label, so one
 * sentence serves both switch positions instead of two drifting copies.
 *
 *   withTalentPaidTierLabel("Upgrade to {tier} to add pages.")
 *     switch on  -> "Upgrade to Web Office to add pages."
 *     switch off -> "Upgrade to Portfolio to add pages."
 *   withTalentPaidTierLabel("...{tier}...", "es")
 *     switch on  -> "...Oficina Web..."
 */
export function withTalentPaidTierLabel(
  template: string,
  locale?: string | null,
): string {
  return withTalentTierLabel(template, "max", locale);
}

/**
 * Fill `{tier}` with a SPECIFIC tier bucket's label.
 *
 * Needed for the copy that sells a perk `talent_pro` already grants today
 * (profile embeds, the press band, premium templates, the media kit). Those
 * sentences named "Pro" before the fold and must keep naming "Pro" while the
 * switch is off, or a dark build points a Free talent at the $15 plan for a
 * $9 feature. Once the switch is on both buckets resolve to "Web Office"
 * (EN) / "Oficina Web" (ES), which is exactly the fold.
 */
export function withTalentTierLabel(
  template: string,
  tier: TalentTierLabelTier,
  locale?: string | null,
): string {
  return template.split("{tier}").join(talentTierLabel(tier, locale));
}
