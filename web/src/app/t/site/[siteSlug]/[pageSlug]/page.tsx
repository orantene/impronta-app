/**
 * Talent Max Site — public INNER page.
 *
 * Route: `/t/site/[siteSlug]/[pageSlug]` — a specific page of the talent's
 * multi-page website (the `talent_pages` row whose `slug` = `pageSlug`),
 * rendered inside the same talent SHELL (header/footer/logo + page nav) as the
 * home page. SEPARATE from the `/t/[code]` discovery profile.
 *
 * Resolution + gating are identical to the home route — handled entirely by the
 * shared `renderTalentMaxSite()` server function, with `pageSlug` passed
 * through. Any resolution miss → `notFound()` (404), never a throw or a blank.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicPathPrefix } from "@/lib/saas/scope";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";
import {
  maxSiteJsonLdString,
  maxSiteSeoToMetadata,
} from "@/lib/talent-site/server/site-metadata";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/** English (unprefixed) path of this inner page — feeds shared hreflang. */
function innerPath(siteSlug: string, pageSlug: string): string {
  return `/t/site/${encodeURIComponent(siteSlug)}/${encodeURIComponent(pageSlug)}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string; pageSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const { siteSlug, pageSlug } = await params;
  const { preview } = await searchParams;
  const locale = await getRequestLocale();
  const path = innerPath(siteSlug, pageSlug);
  const result = await renderTalentMaxSite({
    siteSlug,
    pageSlug,
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

export default async function TalentMaxSiteInnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string; pageSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  if (!isSupabaseConfigured()) notFound();
  const { siteSlug, pageSlug } = await params;
  const { preview } = await searchParams;
  const [locale, publicPathPrefix] = await Promise.all([
    getRequestLocale(),
    getPublicPathPrefix(),
  ]);

  const result = await renderTalentMaxSite({
    siteSlug,
    pageSlug,
    locale,
    publicPathPrefix,
    previewDraft: preview === "draft",
    canonicalOrigin: publicSiteMetadataBase().origin,
    canonicalPath: innerPath(siteSlug, pageSlug),
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
