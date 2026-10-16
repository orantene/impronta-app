import { overrideBadgeLabel, overrideWarning, siteBookingModeView } from "@/lib/talent/site-booking-mode";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";

/** TUL-685: amber chip on a service row whose own mode differs from the site setting. */
export function SiteOverrideChip({
  own,
  site,
  locale = "en",
}: {
  own: string | null | undefined;
  site: TalentBookingPosture;
  locale?: string;
}) {
  const view = siteBookingModeView(own, site);
  if (!view.overridesSite) return null;
  return (
    <span
      data-testid="site-mode-override-badge"
      title={overrideWarning(locale)}
      className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950"
    >
      {overrideBadgeLabel(view.effective, locale)}
    </span>
  );
}
