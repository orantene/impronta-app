/**
 * Talent-site blog index: bare `/blog` on a talent host (TUL-1003 / TUL-1006).
 *
 * The proxy (`talent-site-host-routing.ts`, kind "blog") rewrites `/blog` →
 * `/_talent-site/blog` (query kept, so `?page=n` arrives here). The talent id
 * is trusted only via `resolveTalentPostSite`. Shared data / markup / metadata:
 * `lib/cms/blog-index.tsx`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { BlogIndexView, buildBlogIndexMetadata, loadBlogIndex } from "@/lib/cms/blog-index";
import { blogIndexHref, parseBlogIndexPage } from "@/lib/cms/blog-index-model";
import { talentHasBlogPage } from "@/lib/cms/blog-cms-page";
import { resolveTalentPostSite } from "@/lib/cms/posts-public-site";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import TalentSiteHostPage, { generateMetadata as pageMetadata } from "../[[...pageSlug]]/page";
import { renderTalentBlogShell } from "./talent-blog-shell";

export const revalidate = 60;

const PAGE_PARAMS = Promise.resolve({ pageSlug: ["blog"] });

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const [sp, locale, site] = await Promise.all([searchParams, getRequestLocale(), resolveTalentPostSite()]);
  if (!site) return { robots: { index: false, follow: false } };
  if (await talentHasBlogPage(site.scope.kind === "talent" ? site.scope.talentProfileId : "")) {
    return pageMetadata({ params: PAGE_PARAMS, searchParams: Promise.resolve({}) });
  }
  return buildBlogIndexMetadata(site, locale, parseBlogIndexPage(sp.page));
}

export default async function TalentBlogIndexPage({ searchParams }: Props) {
  if (!isSupabaseConfigured()) notFound();
  const [sp, locale, site] = await Promise.all([searchParams, getRequestLocale(), resolveTalentPostSite()]);
  if (!site) notFound();
  // A personal-site page slugged "blog" predates the index and keeps its URL.
  if (site.scope.kind === "talent" && (await talentHasBlogPage(site.scope.talentProfileId))) {
    return TalentSiteHostPage({ params: PAGE_PARAMS, searchParams: Promise.resolve({}) });
  }
  const page = parseBlogIndexPage(sp.page);
  const data = await loadBlogIndex(site, locale, page);
  if (data.page.outOfRange) notFound();
  const shell = await renderTalentBlogShell(site, locale, blogIndexHref(page), <BlogIndexView site={site} locale={locale} data={data} />);
  if (!shell) notFound();
  return shell;
}
