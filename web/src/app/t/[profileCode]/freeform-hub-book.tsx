import { HubProfileCta } from "./hub-profile-book-cta";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { talentOffersInstantBooking } from "@/lib/scheduling/talent-booking-mode";
import { resolveHubProfileCta } from "@/lib/talent-site/hub-profile-book-cta";
import { loadBookEntry } from "@/lib/talent-site/server/load-book-entry";

/** Same look as the layouts' primary Inquire button (profile-view `inquireBtnClass`). */
const BOOK_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full bg-[var(--plt-forest)] px-5 py-2.5 text-sm font-medium text-[var(--plt-forest-on)] shadow-[var(--plt-shadow-forest)] transition-[background,transform] hover:bg-[var(--plt-forest-deep)] hover:-translate-y-[1px]";

/**
 * The freeform hub profile renders the site view instead of the layouts that
 * carry `inquireButtons`, so it gets its own Book bar (TUL-246). Presentational
 * and sync so the rule is testable: the SAME `HubProfileCta` decision as the
 * other slots (bookable services → `#book`) with no Inquire fallback, since the
 * freeform view brings its own contact chrome.
 */
export function FreeformHubBookBar({
  hasBookableServices,
  locale,
}: {
  hasBookableServices: boolean;
  locale: string;
}) {
  if (resolveHubProfileCta({ platformHost: true, hasBookableServices }).kind !== "book") return null;
  return (
    <div data-hub-book-bar="" className="flex justify-center px-4 py-3">
      <HubProfileCta
        slot="freeform"
        platformHost
        hasBookableServices
        locale={locale}
        className={BOOK_BTN_CLASS}
      >
        {null}
      </HubProfileCta>
    </div>
  );
}

export async function FreeformHubBook({
  talentProfileId,
  locale,
}: {
  talentProfileId: string;
  locale: string;
}) {
  let confirmsByHand = true;
  const admin = createServiceRoleClient();
  if (admin) {
    const { data, error } = await admin
      .from("talent_profiles")
      .select("talent_plan_key")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (!error) {
      confirmsByHand = !talentOffersInstantBooking(
        (data as { talent_plan_key?: string | null } | null)?.talent_plan_key,
      );
    }
  }
  const bookEntry = await loadBookEntry({ talentProfileId, locale, confirmsByHand });
  return (
    <FreeformHubBookBar hasBookableServices={bookEntry.kind === "sheet"} locale={locale} />
  );
}
