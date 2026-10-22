/**
 * Tulala product blog index: tulala.digital/blog and /es/blog (TUL-1399).
 *
 * Marketing host only. The posts are an ordinary workspace's posts (env
 * PLATFORM_BLOG_TENANT_ID), written in the regular Posts writer. With the env
 * unset this page 404s, exactly as /blog did before. Workspace hosts never reach
 * it: their bare /blog is a CMS page and is rewritten before routing.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { listPublicPosts } from "@/lib/cms/posts-public";
import { blogPostPath } from "@/lib/cms/posts-public-model";
import { resolvePlatformBlogSite } from "@/lib/cms/platform-blog-site";
import { postSiteHref, postSiteUrlFor } from "@/lib/cms/posts-public-site";
import { PlatformBlogFrame } from "@/components/marketing/platform-blog-frame";

export const dynamic = "force-dynamic";

const COPY = {
  en: { title: "Tulala blog", lede: "Guides, launches and what we are learning.", empty: "No posts yet. Check back soon.", otherLanguage: "These posts are available in Spanish." },
  es: { title: "Blog de Tulala", lede: "Guías, lanzamientos y lo que vamos aprendiendo.", empty: "Todavía no hay publicaciones. Vuelve pronto.", otherLanguage: "Estas publicaciones están disponibles en inglés." },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, site] = await Promise.all([getRequestLocale(), resolvePlatformBlogSite()]);
  if (!site) return { robots: { index: false, follow: false } };
  const c = COPY[locale === "es" ? "es" : "en"];
  const urlFor = postSiteUrlFor(site);
  return {
    title: c.title,
    description: c.lede,
    alternates: {
      canonical: urlFor("/blog", locale),
      languages: { en: urlFor("/blog", "en"), es: urlFor("/blog", "es") },
    },
  };
}

export default async function PlatformBlogIndexPage() {
  const [locale, site] = await Promise.all([getRequestLocale(), resolvePlatformBlogSite()]);
  if (!site) notFound();
  const c = COPY[locale === "es" ? "es" : "en"];
  const own = await listPublicPosts(site.scope, locale).catch(() => []);
  // TUL-1399: with nothing in this language yet, show the other language's posts
  // (each opens in its own language) instead of an empty page.
  const other = locale === "es" ? "en" : "es";
  const fallback = own.length === 0 ? await listPublicPosts(site.scope, other).catch(() => []) : [];
  const posts = own.length > 0 ? own : fallback;
  const postLocale = own.length > 0 ? locale : other;
  return (
    <PlatformBlogFrame>
      <section className="site-post site-post--index" lang={locale}>
        <header className="site-post__head">
          <h1 className="site-post__title">
            <span>{c.title}</span>
          </h1>
          <p className="site-post__byline">
            <span>{c.lede}</span>
          </p>
        </header>
        {fallback.length > 0 ? <p>{c.otherLanguage}</p> : null}
        {posts.length === 0 ? (
          <p>{c.empty}</p>
        ) : (
          <ul className="site-post__list">
            {posts.map((p) => (
              <li key={p.id} className="site-post__list-item">
                <Link href={postSiteHref(site, blogPostPath(p.slug), postLocale)} hrefLang={postLocale} lang={postLocale}>
                  {p.title}
                </Link>
                {p.excerpt.trim() ? <p>{p.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PlatformBlogFrame>
  );
}
