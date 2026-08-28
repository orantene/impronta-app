/**
 * campaign-grant.ts — what a marketing campaign owes a redeemer beyond the money.
 *
 * A campaign has two halves. The DISCOUNT is Stripe's problem: it lowers the
 * invoice. The GRANT is ours: it decides what the account can actually DO while
 * the offer runs. "Two months free with full premium support" is exactly this
 * shape, and before campaigns existed the second half was a manual step someone
 * had to remember for every single redeemer.
 *
 * Pure and I/O-free so the eligibility rules can be tested without a database,
 * a clock, or Stripe.
 */

export type CampaignRow = {
  slug: string;
  status: string;
  grant_plan_tier: string | null;
  grant_duration_days: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type CampaignGrant = {
  planTier: string;
  /** ISO timestamp the granted tier reverts. Never open-ended. */
  expiresAt: string;
};

/**
 * Is this campaign live right now?
 *
 * A window that cannot be parsed counts as CLOSED. A campaign is a promise to
 * give something away; when the dates are unreadable the safe answer is "no
 * grant" — an unearned free upgrade is harder to take back than to hand out.
 */
export function isCampaignLive(campaign: CampaignRow, now: Date): boolean {
  if (campaign.status !== "active") return false;

  if (campaign.starts_at) {
    const starts = Date.parse(campaign.starts_at);
    if (Number.isNaN(starts) || now.getTime() < starts) return false;
  }
  if (campaign.ends_at) {
    const ends = Date.parse(campaign.ends_at);
    if (Number.isNaN(ends) || now.getTime() >= ends) return false;
  }
  return true;
}

/**
 * The entitlement half, or null when the discount IS the whole offer.
 *
 * Returns an absolute expiry rather than a duration so the caller cannot
 * accidentally re-clock it on a retry: a webhook that fires twice must not
 * extend someone's free upgrade twice.
 */
export function resolveCampaignGrant(
  campaign: CampaignRow | null,
  now: Date,
): CampaignGrant | null {
  if (!campaign) return null;
  if (!isCampaignLive(campaign, now)) return null;
  if (!campaign.grant_plan_tier || !campaign.grant_duration_days) return null;

  const expires = new Date(now.getTime() + campaign.grant_duration_days * 24 * 60 * 60 * 1000);
  return { planTier: campaign.grant_plan_tier, expiresAt: expires.toISOString() };
}
