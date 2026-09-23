/**
 * Free personal website — the "Made with Tulala" footer mark (pure).
 *
 * A free site carries the badge; a paid one does not. The decision reuses
 * `talentPlanRemovesPlatformBadge`, the SAME predicate the `/t/[code]` profile
 * footer already uses, so the mark can never appear on one surface and not the
 * other for the same talent.
 *
 * Flags-off parity is automatic rather than switch-dependent: while
 * `TALENT_FREE_WEBSITE_ENABLED` is off the only plan that renders a personal
 * site at all is `talent_portfolio`, and that plan removes the badge — so no
 * badge appears anywhere, exactly as today.
 */

import { talentPlanRemovesPlatformBadge } from "@/lib/access/talent-membership";
import { pickLocale } from "@/lib/i18n/pick-locale";

/** Does this talent's site carry the platform mark? */
export function talentSiteShowsPlatformBadge(
  planKey: string | null | undefined,
): boolean {
  return !talentPlanRemovesPlatformBadge(planKey);
}

/** The badge label, en + es. */
export function talentSiteBadgeLabel(locale: string | null | undefined): string {
  return pickLocale(locale, {
    en: "Made with Tulala",
    es: "Hecho con Tulala",
  });
}
