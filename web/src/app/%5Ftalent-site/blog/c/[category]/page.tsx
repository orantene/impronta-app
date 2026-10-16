/** Talent-site category page — `/blog/c/<category>` (Posts v1, TUL-1009). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { blogCategoryPath } from "@/lib/cms/posts-public-model";
import { buildCategoryMetadata, PostCategoryView } from "@/lib/cms/posts-public-page";
import { resolveTalentPostSite } from "@/lib/cms/posts-public-site";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { renderTalentBlogShell } from "../../talent-blog-shell";

export const revalidate = 60;

type Params = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const [{ category }, locale, site] = await Promise.all([params, getRequestLocale(), resolveTalentPostSite()]);
  if (!site) return { robots: { index: false, follow: false } };
  return buildCategoryMetadata(site, locale, category);
}

export default async function TalentBlogCategoryPage({ params }: Params) {
  if (!isSupabaseConfigured()) notFound();
  const [{ category }, locale, site] = await Promise.all([params, getRequestLocale(), resolveTalentPostSite()]);
  if (!site) notFound();
  const view = await PostCategoryView({ site, locale, categorySlug: category });
  if (!view) notFound();
  const page = await renderTalentBlogShell(site, locale, blogCategoryPath(category), view);
  if (!page) notFound();
  return page;
}
