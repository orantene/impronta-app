import { pickLocale } from "@/lib/i18n/pick-locale";
import { DEMO_SITE_BADGE_TIP } from "@/lib/talent/demo-talent";

/**
 * TUL-516 P1 — fixed corner Demo marker (bottom-left). Out of document flow so
 * theme headers stay the first painted content. Positioning + clearance live in
 * `floating-chrome-stack` so the badge never sits on the booking bar or chat FAB.
 */
export function SiteDemoBadge({ locale = "en" }: { locale?: string }) {
  const tip = pickLocale(locale, DEMO_SITE_BADGE_TIP);
  return (
    <div data-site-demo-badge="" role="status" aria-label={tip}>
      <span className="site-demo-badge__label">Demo</span>
      <span className="site-demo-badge__info" tabIndex={0} title={tip} aria-label={tip}>
        i
      </span>
      <span className="site-demo-badge__tip" role="tooltip">
        {tip}
      </span>
    </div>
  );
}
