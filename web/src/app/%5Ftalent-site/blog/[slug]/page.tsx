/**
 * Talent-site post — `/blog/<slug>` on a talent host (Posts v1, TUL-1009).
 *
 * The proxy (`talent-site-host-routing.ts`, kind "blog") rewrites
 * `/blog/<slug>` → `/_talent-site/blog/<slug>` and sets the talent header; the
 * talent id is trusted only via `resolveTalentPostSite` (same gate as the
 * `[[...pageSlug]]` host route). Static `blog/` wins over the optional
 * catch-all sibling. Shared logic: `lib/cms/posts-public-page.tsx`.
 */
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { blogPostPath } from "@/lib/cms/posts-public-model";
import { buildPostMetadata, loadPostPage, PostArticleView } from "@/lib/cms/posts-public-page";
import { resolveTalentPostSite } from "@/lib/cms/posts-public-site";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { renderTalentBlogShell } from "../talent-blog-shell";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveTalentPostSite()]);
  if (!site) return { robots: { index: false, follow: false } };
  return buildPostMetadata(site, locale, slug);
}

export default async function TalentBlogPostPage({ params }: Params) {
  if (!isSupabaseConfigured()) notFound();
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveTalentPostSite()]);
  if (!site) notFound();
  const loaded = await loadPostPage(site, locale, slug);
  if (loaded.kind === "redirect") permanentRedirect(loaded.to);
  if (loaded.kind !== "render") notFound();
  const article = await PostArticleView({ site, post: loaded.post, expired: loaded.state.state === "expired", locale });
  const page = await renderTalentBlogShell(site, locale, blogPostPath(loaded.post.slug), article);
  if (!page) notFound();
  return page;
}
