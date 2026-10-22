// TUL-1371: the talent's "Where you appear", "Where it's sold" and "Earnings by
// channel". Standalone server page (registered in CANONICAL_ROUTE_MATCHERS so the
// talent shell yields), same pattern as /talent/discover.
import { notFound } from "next/navigation";

import { PendingListingUpdates } from "@/components/talent/service-hub/PendingListingUpdates";
import { CalendarByChannelPanel, EarningsByChannelCard, WhereItsSoldPanel, WhereYouAppearPanel } from "@/components/talent/service-hub/ChannelPanels";
import { getRequestLocale } from "@/i18n/request-locale";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { loadOwnTalentProfileId } from "@/lib/talent/talent-languages-store";
import { channelCopy } from "@/lib/talent/service-hub-channels";
import { loadServiceHubChannels } from "@/lib/talent/service-hub-channels.server";

export const dynamic = "force-dynamic";

export default async function TalentWhereYouAppearPage() {
  const session = await getCachedActorSession();
  if (!session.user) notFound();
  const [locale, talentProfileId, supabase] = await Promise.all([
    getRequestLocale(),
    loadOwnTalentProfileId(session.user.id),
    createSupabaseServerClient(),
  ]);
  if (!talentProfileId || !supabase) notFound();
  const c = channelCopy(locale);
  const data = await loadServiceHubChannels(supabase, talentProfileId, session.user.id);
  const currency = data.ok ? (data.services[0]?.service.currency ?? "USD") : "USD";
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 py-8" data-testid="where-you-appear-page">
      <h1 className="m-0 text-2xl font-semibold">{c.whereAppear}</h1>
      {!data.ok ? (
        <p role="alert">{c.saveFailed}</p>
      ) : (
        <>
          <PendingListingUpdates items={data.pending} locale={locale} />
          <WhereYouAppearPanel items={data.appearances} locale={locale} />
          {data.services.map((s) => (
            <WhereItsSoldPanel key={s.service.id} data={s} locale={locale} />
          ))}
          <CalendarByChannelPanel result={data.calendar} locale={locale} />
          <EarningsByChannelCard items={data.earnings} currency={currency} locale={locale} />
        </>
      )}
    </main>
  );
}
