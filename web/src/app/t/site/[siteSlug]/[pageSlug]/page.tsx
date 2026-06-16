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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

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
  const result = await renderTalentMaxSite({
    siteSlug,
    pageSlug,
    locale,
    previewDraft: preview === "draft",
  });
  if (result.kind !== "render") return { title: "Not found" };
  const { seo } = result;
  return {
    title: seo.title,
    ...(seo.description ? { description: seo.description } : {}),
    ...(seo.noindex ? { robots: { index: false, follow: false } } : {}),
  };
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
  });
  if (result.kind !== "render") notFound();
  return result.node;
}
