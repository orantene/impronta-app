import { HubProfileCta } from "./hub-profile-book-cta";
import { loadTalentIntake } from "./_chat/talent-intake.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadTalentMaxSiteLink } from "@/lib/talent-site/server/load-max-site-link";
import { resolveHubProfileCta } from "@/lib/talent-site/hub-profile-book-cta";
import type { TalentAskEntry } from "@/lib/talent/chat-entry";

/** Same look as the layouts' primary Inquire button (profile-view `inquireBtnClass`). */
const BOOK_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full bg-[var(--plt-forest)] px-5 py-2.5 text-sm font-medium text-[var(--plt-forest-on)] shadow-[var(--plt-shadow-forest)] transition-[background,transform] hover:bg-[var(--plt-forest-deep)] hover:-translate-y-[1px]";

/**
 * The freeform hub profile renders the site view instead of the layouts that
 * carry `inquireButtons`, so it gets its own Book bar (TUL-246). Presentational
 * and sync so the rule is testable: the SAME `HubProfileCta` decision as the
 * other slots (talent has a site, intake switches allow it) with no Inquire
 * fallback, since the freeform view brings its own contact chrome.
 */
export function FreeformHubBookBar({
  maxSiteUrl,
  askEntry,
  locale,
}: {
  maxSiteUrl: string | null;
  askEntry: TalentAskEntry;
  locale: string;
}) {
  if (resolveHubProfileCta({ platformHost: true, maxSiteUrl, askEntry }).kind !== "book") return null;
  return (
    <div data-hub-book-bar="" className="flex justify-center px-4 py-3">
      <HubProfileCta
        slot="freeform"
        platformHost
        maxSiteUrl={maxSiteUrl}
        askEntry={askEntry}
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
  const [link, intake] = await Promise.all([
    loadTalentMaxSiteLink(talentProfileId),
    loadTalentIntake({ admin: createServiceRoleClient(), talentProfileId, chatTenantSlug: null }),
  ]);
  return <FreeformHubBookBar maxSiteUrl={link?.url ?? null} askEntry={intake.askEntry} locale={locale} />;
}
