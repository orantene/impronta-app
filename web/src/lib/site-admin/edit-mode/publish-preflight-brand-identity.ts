/**
 * Brand identity publish tip (TUL-524; was owner decision 1, 2026-09-16).
 *
 * A site may be built, previewed, edited and published with no logo asset.
 * New sites default to the business-name wordmark at seed. Missing identity
 * is an advisory tip only (upload a logo later), never a publish blocker.
 */

export type BrandIdentityInputs = {
  /** `agency_branding.logo_media_asset_id` is set. */
  hasLogo: boolean;
  /** `agencies.settings.brand_identity === "wordmark"`. */
  wordmarkChosen: boolean;
};

export type BrandIdentityVerdict = { ok: true } | { ok: false; reason: "no_identity" };

export function brandIdentityVerdict(input: BrandIdentityInputs): BrandIdentityVerdict {
  if (input.hasLogo || input.wordmarkChosen) return { ok: true };
  return { ok: false, reason: "no_identity" };
}

/** Surfaces the rule applies to: the tenant's own site, not a talent page. */
export function brandIdentityAppliesTo(surfaceKind: string | null | undefined): boolean {
  return !surfaceKind || surfaceKind === "homepage" || surfaceKind === "cms_page" || surfaceKind === "site_shell";
}

export const BRAND_IDENTITY_MESSAGE =
  "Your business name is your logo for now. Upload a custom logo anytime from Brand.";
