import Link from "next/link";
import { notFound } from "next/navigation";

import { loadTalentSelfProfileByUser } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { SeoScoreCard } from "@/components/talent/get-found/SeoScoreCard";
import { SearchConsoleGuide } from "@/components/talent/get-found/SearchConsoleGuide";
import { GoogleBusinessGuide } from "@/components/talent/get-found/GoogleBusinessGuide";
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { buildGbpGuide } from "@/lib/talent/google-business-profile-guide";
import { buildSeoScore } from "@/lib/talent/seo-score";
import { buildGscGuide } from "@/lib/talent/search-console-guide";
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

  // TUL-581: three cheap reads (one row each / head counts), service role like the profile loader.
  const admin = createServiceRoleClient();
  let bioLength = 0;
  let pricedServiceCount = 0;
  let languageCount = 0;
  let reviewCount = 0;
  if (admin) {
    const [row, offers, langs] = await Promise.all([
      admin.from("talent_profiles").select("short_bio, bio_i18n, rating_count").eq("id", profile.id).limit(1),
      admin
        .from("talent_offerings")
        .select("amount_cents, price_display")
        .eq("talent_profile_id", profile.id)
        .neq("status", "archived")
        .limit(50),
      admin.from("talent_languages").select("id", { count: "exact", head: true }).eq("talent_profile_id", profile.id),
    ]);
    const p = row.data?.[0];
    const bios = [p?.short_bio, ...Object.values((p?.bio_i18n as Record<string, string | null> | null) ?? {})];
    bioLength = Math.max(0, ...bios.map((b) => (typeof b === "string" ? b.trim().length : 0)));
    reviewCount = p?.rating_count ?? 0;
    pricedServiceCount = (offers.data ?? []).filter(
      (o) => (o.amount_cents ?? 0) > 0 || (o.price_display ?? "").trim().length > 0,
    ).length;
    languageCount = langs.count ?? 0;
  }
  // Bio can live in the catalog field value; trust the profile flag when columns are empty.
  if (bioLength === 0 && profile.hasBio) bioLength = 120;
  const seo = buildSeoScore(
    {
      bioLength,
      photoCount: profile.portfolioCount,
      pricedServiceCount,
      homeCity: profile.homeCity,
      languageCount,
      published: profile.workflowStatus === "published" || profile.workflowStatus === "approved",
      reviewCount,
      hasCustomDomain: gscGuide.mode === "custom",
    },
    lang,
  );

  return (
    <>
      <SeoScoreCard seo={seo} lang={lang} />
      <GoogleBusinessGuide guide={guide} lang={lang} />
      <SearchConsoleGuide guide={gscGuide} lang={lang} />
      <div className="mx-auto max-w-2xl px-6 pb-6 text-sm">
        <Link href="/talent/site" className="text-neutral-500 underline">
          {lang === "es" ? "Volver a Mi presencia" : "Back to My presence"}
        </Link>
      </div>
    </>
  );
}
