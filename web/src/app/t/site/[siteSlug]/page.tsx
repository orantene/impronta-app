/**
 * Talent Max Site — public HOME page.
 *
 * Route: `/t/site/[siteSlug]` — the talent's multi-page website HOME page
 * (the `talent_pages` row with `is_home=true`), rendered inside the talent's own
 * SHELL (header/footer/logo + page nav). SEPARATE from the `/t/[code]` discovery
 * profile.
 *
 * App-router precedence note: the STATIC `site` segment beats the dynamic
 * `[profileCode]`, so `/t/site/...` is unambiguous; a profile code is never
 * "site". This route resolves `siteSlug → talent_sites.site_slug → the talent +
 * home page` and renders via the shared `renderTalentMaxSite()` server function.
 *
 * Gating (in `renderTalentMaxSite`):
 *   - PUBLIC render only when `site_published_at` is set AND the talent holds
 *     Max (`talent_portfolio`); else `notFound()` (a lapsed plan stops serving).
 *   - `?preview=draft` → owner-only draft preview (draft shell + draft pages).
 *   - Any resolution miss degrades to 404 — never a throw or a blank.
 */

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicPathPrefix } from "@/lib/saas/scope";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { talentSitePathRedirectTarget } from "@/lib/talent-site/site-public-url";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";
import {
  maxSiteJsonLdString,
  maxSiteSeoToMetadata,
} from "@/lib/talent-site/server/site-metadata";

// A talent's site must reflect their latest publish — mirror the profile/page
// routes' caching contract so a freshly-published edit is never stale.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/** English (unprefixed) path of this site home page — feeds shared hreflang. */
function homePath(siteSlug: string): string {
  return `/t/site/${encodeURIComponent(siteSlug)}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const { siteSlug } = await params;
  const { preview } = await searchParams;
  const locale = await getRequestLocale();
  const path = homePath(siteSlug);
  const result = await renderTalentMaxSite({
    siteSlug,
    locale,
    previewDraft: preview === "draft",
    canonicalOrigin: publicSiteMetadataBase().origin,
    canonicalPath: path,
  });
  if (result.kind !== "render") return { title: "Not found" };
  return maxSiteSeoToMetadata(result.seo, {
    localePathWithoutLocale: path,
    locale,
  });
}

export default async function TalentMaxSiteHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  if (!isSupabaseConfigured()) notFound();
  const { siteSlug } = await params;
  const { preview } = await searchParams;

  // Once the site lives at `<slug>.tulala.digital`, this path is its OLD
  // address: one canonical home, one set of links people share. 308 so the move
  // is permanent for crawlers, with `?preview=draft` carried across so an
  // owner's preview link keeps previewing. Dev keeps serving the path (no
  // wildcard DNS locally), and with the switch off nothing changes at all.
  const redirectTo = talentSitePathRedirectTarget({
    slug: siteSlug,
    preview,
    enabled: isTalentSiteSubdomainsEnabled(),
    isProduction: process.env.NODE_ENV === "production",
  });
  if (redirectTo) permanentRedirect(redirectTo);

  const [locale, publicPathPrefix] = await Promise.all([
    getRequestLocale(),
    getPublicPathPrefix(),
  ]);

  const result = await renderTalentMaxSite({
    siteSlug,
    locale,
    publicPathPrefix,
    hrefMode: "path",
    previewDraft: preview === "draft",
    canonicalOrigin: publicSiteMetadataBase().origin,
    canonicalPath: homePath(siteSlug),
  });
  if (result.kind !== "render") notFound();
  const jsonLd = maxSiteJsonLdString(result.seo);
  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      ) : null}
      {result.node}
    </>
  );
}
