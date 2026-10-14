import Link from "next/link";
import { notFound } from "next/navigation";

import { loadTalentSelfProfileByUser } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { SearchConsoleGuide } from "@/components/talent/get-found/SearchConsoleGuide";
import { GoogleBusinessGuide } from "@/components/talent/get-found/GoogleBusinessGuide";
import { getRequestLocale } from "@/i18n/request-locale";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { buildGbpGuide } from "@/lib/talent/google-business-profile-guide";
import { buildGscGuide } from "@/lib/talent/search-console-guide";
import { loadTalentGoogleSiteVerification } from "@/lib/talent-site/server/load-google-site-verification.server";
import { talentPublicProfileHref } from "@/lib/talent/public-profile-href";

export const dynamic = "force-dynamic";

/** TUL-584: Google Business Profile setup guide, pre-filled from the talent's own data. */
export default async function PlatformTalentGetFoundPage() {
  const session = await getCachedActorSession();
  if (!session.user) notFound();
  const profile = await loadTalentSelfProfileByUser(session.user.id);
  if (!profile) notFound();

  const lang = (await getRequestLocale()) === "es" ? "es" : "en";
  const siteUrl = profile.profileCode ? talentPublicProfileHref(profile.profileCode) : null;
  const guide = buildGbpGuide(
    {
      displayName: profile.displayName,
      tradeLabel: profile.primaryTypeLabel,
      homeCity: profile.homeCity,
      siteUrl,
      bookingUrl: siteUrl ? `${siteUrl}#book` : null,
    },
    lang,
  );

  const gscGuide = buildGscGuide({ siteUrl }, lang);
  const gscToken = await loadTalentGoogleSiteVerification(profile.id);

  return (
    <>
      <GoogleBusinessGuide guide={guide} lang={lang} />
      <SearchConsoleGuide guide={gscGuide} lang={lang} initialToken={gscToken} />
      <div className="mx-auto max-w-2xl px-6 pb-6 text-sm">
        <Link href="/talent/site" className="text-neutral-500 underline">
          {lang === "es" ? "Volver a Mi presencia" : "Back to My presence"}
        </Link>
      </div>
    </>
  );
}
