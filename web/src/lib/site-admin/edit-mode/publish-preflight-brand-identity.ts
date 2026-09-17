/**
 * Brand identity publish rule (owner decision 1, 2026-09-16).
 *
 * A site may be built, previewed and edited with no branding asset at all.
 * Publishing needs the identity completed: a logo, OR the choice "use my
 * business name as my logo" (a wordmark set in the Look's typography). Never
 * a prerequisite before value; never read as "not a business". Pure rule
 * here; the server reads the two inputs and the drawer offers the wordmark.
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
  "Complete your brand identity to publish: upload a logo, or use your business name as your logo.";
