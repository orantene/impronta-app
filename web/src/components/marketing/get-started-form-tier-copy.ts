/**
 * Tier-aware copy helpers for the /get-started signup form.
 *
 * Extracted from `get-started-form.tsx` to keep that file under the 800-line
 * lint cap. The form imports these exports and uses them inline.
 *
 * - `isPaidTier` — type guard narrowing tier to "studio" | "agency" so call
 *   sites get correct TS narrowing without re-checking the union.
 * - `formFinePrint` — fineprint string under the submit button. Reads
 *   the per-tier monthly price AND display name from the live catalog
 *   so admin rename + reprice edits propagate without further code
 *   changes (Phase 2 + post-QA rename fix).
 * - `submitCtaLabel` — submit button text. Branches on tier slug for the
 *   sales-vs-self-serve Network path and on the catalog-loaded display
 *   name so "Continue to <name> checkout" stays in sync with renames.
 */

import {
  reservedBrandedSubdomainHost,
  workspacePathHost,
} from "@/lib/saas/workspace-public-url";

type TierKey = "free" | "studio" | "agency" | "network";
type AudienceKey = "operator" | "agency" | "organization";

/**
 * Host shown in the URL-preview row. Studio/Agency provision a branded
 * subdomain immediately; Network leads get a free workspace first (path
 * URL), with the branded host set up later during Network onboarding —
 * surfacing it at signup would mis-represent what they actually receive.
 */
export function preferredLinkPreview(slug: string, tier?: TierKey): string {
  if (tier === "studio" || tier === "agency") {
    return reservedBrandedSubdomainHost(slug);
  }
  return workspacePathHost(slug);
}

export function preferredLinkLabel(tier?: TierKey): string {
  return tier === "studio" || tier === "agency"
    ? "Preferred branded host"
    : "Your public URL";
}

export type GetStartedTierPrices = Partial<
  Record<"free" | "studio" | "agency" | "network", string>
>;

/**
 * Per-tier display name resolved from `product_tiers.name` in the catalog.
 * When admin renames a tier, the new name is pushed through here so the
 * submit-button label and the fine-print stay in sync. Falls back to the
 * canonical slug-cased label when undefined (mock mode, or before the
 * catalog has loaded).
 */
export type GetStartedTierNames = Partial<
  Record<"free" | "studio" | "agency" | "network", string>
>;

const FALLBACK_TIER_LABEL: Record<TierKey, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

export function tierDisplayName(
  tier: TierKey,
  names: GetStartedTierNames | undefined,
): string {
  return names?.[tier]?.trim() || FALLBACK_TIER_LABEL[tier];
}

/**
 * Label for the form's submit button. Network branches on whether the
 * catalog has a price for it (which requires STRIPE_PRICE_NETWORK_MONTHLY
 * in env) — when self-serve is wired the button reads "Continue to
 * <Network name> checkout"; otherwise it stays as the sales-contact
 * "Request <Network name> setup".
 */
export function submitCtaLabel(
  tier: TierKey | undefined,
  audience: AudienceKey,
  prices: GetStartedTierPrices | undefined,
  names?: GetStartedTierNames,
): string {
  if (tier === "studio") return `Continue to ${tierDisplayName("studio", names)} checkout`;
  if (tier === "agency") return `Continue to ${tierDisplayName("agency", names)} checkout`;
  if (tier === "network") {
    const name = tierDisplayName("network", names);
    return prices?.network ? `Continue to ${name} checkout` : `Request ${name} setup`;
  }
  if (audience === "organization") return `Request ${tierDisplayName("network", names)} setup`;
  if (audience === "agency") return `Continue to ${tierDisplayName("agency", names)} checkout`;
  return "Create my free workspace";
}

export function isPaidTier(tier?: TierKey): tier is "studio" | "agency" {
  return tier === "studio" || tier === "agency";
}

export function formFinePrint(
  tier: TierKey | undefined,
  prices: GetStartedTierPrices | undefined,
  names?: GetStartedTierNames,
): string {
  if (tier === "studio") {
    return `${tierDisplayName("studio", names)} · ${prices?.studio ?? "$49"}/mo · Cancel any time`;
  }
  if (tier === "agency") {
    // Agency leads with the 14-day trial framing, not a sticker price.
    return `${tierDisplayName("agency", names)} · 14-day free trial · Cancel any time`;
  }
  if (tier === "network") {
    const name = tierDisplayName("network", names);
    return prices?.network
      ? `${name} · ${prices.network}/mo · Cancel any time`
      : `${name} · We’ll set up pricing with you`;
  }
  return "No credit card · Free plan forever · Upgrade when you’re ready";
}
