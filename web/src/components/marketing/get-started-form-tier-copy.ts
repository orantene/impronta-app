/**
 * Tier-aware copy helpers for the /get-started signup form.
 *
 * Extracted from `get-started-form.tsx` to keep that file under the 800-line
 * lint cap. The form imports these three exports and uses them inline.
 *
 * - `isPaidTier` — type guard narrowing tier to "studio" | "agency" so call
 *   sites get correct TS narrowing without re-checking the union.
 * - `PAID_TIER_PLAN_LABEL` — display label per paid tier slug.
 * - `formFinePrint` — fineprint string under the submit button. Reads the
 *   monthly Studio price from the live catalog (Phase 2) so the marketing
 *   chip stays in sync with /platform/admin/pricing edits.
 */

type TierKey = "free" | "studio" | "agency" | "network";
type AudienceKey = "operator" | "agency" | "organization";

export type GetStartedTierPrices = Partial<
  Record<"free" | "studio" | "agency" | "network", string>
>;

/**
 * Label for the form's submit button. Network branches on whether the
 * catalog has a price for it (which requires STRIPE_PRICE_NETWORK_MONTHLY
 * in env) — when self-serve is wired, the button reads "Continue to
 * Network checkout"; otherwise stays as the sales-contact "Request
 * Network setup".
 */
export function submitCtaLabel(
  tier: TierKey | undefined,
  audience: AudienceKey,
  prices: GetStartedTierPrices | undefined,
): string {
  if (tier === "studio") return "Continue to Studio checkout";
  if (tier === "agency") return "Continue to Agency checkout";
  if (tier === "network") {
    return prices?.network ? "Continue to Network checkout" : "Request Network setup";
  }
  if (audience === "organization") return "Request Network setup";
  if (audience === "agency") return "Continue to Agency checkout";
  return "Create my free workspace";
}

export const PAID_TIER_PLAN_LABEL = { studio: "Studio", agency: "Agency" } as const;

export function isPaidTier(tier?: TierKey): tier is "studio" | "agency" {
  return tier === "studio" || tier === "agency";
}

export function formFinePrint(
  tier: TierKey | undefined,
  prices: GetStartedTierPrices | undefined,
): string {
  if (tier === "studio") {
    return `Studio · ${prices?.studio ?? "$49"}/mo · Cancel any time`;
  }
  if (tier === "agency") {
    // Agency leads with the 14-day trial framing, not a sticker price.
    return "Agency · 14-day free trial · Cancel any time";
  }
  if (tier === "network") {
    // Network self-serve flip: when STRIPE_PRICE_NETWORK_MONTHLY is set the
    // catalog populates prices.network (e.g. "$499/mo"), and the funnel
    // routes through Stripe Checkout. Without it, fall back to the
    // sales-contact framing.
    return prices?.network
      ? `Network · ${prices.network}/mo · Cancel any time`
      : "Network · We’ll set up pricing with you";
  }
  return "No credit card · Free plan forever · Upgrade when you’re ready";
}
