/**
 * Tier-aware copy helpers for the /get-started signup form.
 *
 * Extracted from `get-started-form.tsx` to keep that file under the 800-line
 * lint cap. The form imports these exports and uses them inline.
 *
 * - `isPaidTier` — type guard narrowing tier to "studio" | "agency" so call
 *   sites get correct TS narrowing without re-checking the union.
 * - `PAID_TIER_PLAN_LABEL` — fallback display label per paid tier slug.
 *   Used when the catalog hasn't loaded yet (e.g. mock mode) or for the
 *   needs_signin panel where we don't yet pass the catalog through.
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

function nameOf(tier: TierKey, names: GetStartedTierNames | undefined): string {
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
  if (tier === "studio") return `Continue to ${nameOf("studio", names)} checkout`;
  if (tier === "agency") return `Continue to ${nameOf("agency", names)} checkout`;
  if (tier === "network") {
    const name = nameOf("network", names);
    return prices?.network ? `Continue to ${name} checkout` : `Request ${name} setup`;
  }
  // No explicit ?tier= → everyone starts free regardless of who they are.
  // (The agency/network paid funnels are entered via ?tier= from /pricing,
  // handled above. The audience radio here is self-identification only —
  // routing a small band straight to enterprise "Network setup" would
  // contradict the free-start promise this page now makes.)
  return "Create my free workspace";
}

export const PAID_TIER_PLAN_LABEL = { studio: "Studio", agency: "Agency" } as const;

export function isPaidTier(tier?: TierKey): tier is "studio" | "agency" {
  return tier === "studio" || tier === "agency";
}

export function formFinePrint(
  tier: TierKey | undefined,
  prices: GetStartedTierPrices | undefined,
  names?: GetStartedTierNames,
): string {
  if (tier === "studio") {
    return `${nameOf("studio", names)} · ${prices?.studio ?? "$49"}/mo · Cancel any time`;
  }
  if (tier === "agency") {
    // Agency leads with the 14-day trial framing, not a sticker price.
    return `${nameOf("agency", names)} · 14-day free trial · Cancel any time`;
  }
  if (tier === "network") {
    const name = nameOf("network", names);
    return prices?.network
      ? `${name} · ${prices.network}/mo · Cancel any time`
      : `${name} · We’ll set up pricing with you`;
  }
  return "No credit card · Free plan forever · Upgrade when you’re ready";
}
