import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";
import { overrideBadgeLabel, overrideWarning, siteBookingModeView } from "@/lib/talent/site-booking-mode";

/** TUL-685: shown only when a service's own mode differs from the site-wide setting. */
export function SiteModeOverrideNotice({
  own,
  site,
  locale,
}: {
  own: string | null | undefined;
  site: TalentBookingPosture;
  locale: string;
}) {
  const view = siteBookingModeView(own, site);
  if (!view.overridesSite) return null;
  return (
    <p
      data-testid="site-mode-override-notice"
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950"
    >
      <span className="font-semibold">{overrideBadgeLabel(view.effective, locale)}.</span> {overrideWarning(locale)}
    </p>
  );
}
