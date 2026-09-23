/**
 * Dark-launch switch for the FREE talent website (Phase 1).
 *
 * OFF unless `TALENT_FREE_WEBSITE_ENABLED` is exactly "true" or "1" — the same
 * shape as `talent-site-tier-expansion.ts` and `talent-theme-gallery.ts`, so
 * the three switches read identically at a call site.
 *
 * With it OFF every personal-SITE capability resolves Max-only
 * (`talent_portfolio`), which is byte-for-byte what the code did before Phase 1:
 * only a Max talent's site renders publicly, only a Max talent reaches the
 * builder, and the tier labels still read "Portfolio".
 *
 * Deliberately NOT applied to `personalSiteEdit` / `personalSitePublish` inside
 * the GENERAL `talentPlanGrantsCapability` reader: those two keys are also read
 * by the `/t/[code]` discovery-profile path (`lib/talent-site/server/actions.ts`),
 * where Free talents legitimately edit and publish today. The switch is applied
 * by `talentPlanGrantsSiteCapability`, the SITE-scoped reader, which is the only
 * one the personal-site gates use.
 */
export function isTalentFreeWebsiteEnabled(): boolean {
  const raw = process.env.TALENT_FREE_WEBSITE_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
