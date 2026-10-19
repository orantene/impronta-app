import "server-only";

/**
 * blog-index.tsx: the `/blog` INDEX page shared by BOTH site families
 * (TUL-1003 / TUL-1006). Workspace and talent route files only pick the site
 * and the chrome; the data, markup and metadata live here, next to the
 * category view in `posts-public-page.tsx`.
 *
 *   - lists LISTABLE posts only (published, not expired / unlisted / taken down)
 *     of the request locale, newest first, 10 per page (`?page=n`)
 *   - a page past the end 404s; an empty list is a 200 with an empty state + noindex
 *   - rules: `blog-index-model.ts`; post rules: `posts-public-model.ts`
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  blogIndexCopy,
  buildBlogIndexSeo,
  paginateBlogIndex,
  type BlogIndexPage,
} from "@/lib/cms/blog-index-model";
import { listPublicPosts, type PublicPostsDeps } from "@/lib/cms/posts-public";
import { blogPostPath, postCopyLocale, type PublicPost } from "@/lib/cms/posts-public-model";
import { postSiteHref, postSiteUrlFor, type PostSiteContext } from "@/lib/cms/posts-public-site";

export type BlogIndexData = {
  page: BlogIndexPage<PublicPost>;
  /** Listable post count per site locale (hreflang + noindex decisions). */
  counts: Record<string, number>;
};

/** Never throws: a read failure is an empty list. `deps: null` = no data source. */
export async function loadBlogIndex(
  site: Pick<PostSiteContext, "scope" | "supportedLocales">,
  locale: string,
  page: number,
  deps?: PublicPostsDeps | null,
): Promise<BlogIndexData> {
  const locales = [...new Set([locale, ...site.supportedLocales])];
  const lists = await Promise.all(
    locales.map((l) => listPublicPosts(site.scope, l, {}, deps).catch((): PublicPost[] => [])),
  );
  const counts = Object.fromEntries(locales.map((l, i) => [l, lists[i].length]));
  return { page: paginateBlogIndex(lists[0], page), counts };
}

export async function buildBlogIndexMetadata(
  site: PostSiteContext,
  locale: string,
  page: number,
): Promise<Metadata> {
  const data = await loadBlogIndex(site, locale, page);
  if (data.page.outOfRange) return { robots: { index: false, follow: false } };
  const copy = blogIndexCopy(locale);
  const seo = buildBlogIndexSeo({
    urlFor: postSiteUrlFor(site),
    locale,
    page,
    siteLocales: site.supportedLocales,
    counts: data.counts,
  });
  const title = `${copy.title}${page > 1 ? ` (${copy.pageOf(page, data.page.totalPages)})` : ""} · ${site.siteName}`;
  return {
    title,
    description: copy.description(site.siteName),
    alternates: { canonical: seo.canonical, ...(seo.languages ? { languages: seo.languages } : {}) },
    robots: seo.noindex ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", title, url: seo.canonical, siteName: site.siteName, locale },
  };
}

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(postCopyLocale(locale) === "es" ? "es-MX" : "en-US", { dateStyle: "long" }).format(d);
}

/** The themed list body. Same `.site-post*` classes as the category page. */
export function BlogIndexView(props: { site: PostSiteContext; locale: string; data: BlogIndexData }): ReactNode {
  const { site, locale, data } = props;
  const { page } = data;
  const copy = blogIndexCopy(locale);
  const href = (n: number) => `${postSiteHref(site, "/blog", locale)}${n > 1 ? `?page=${n}` : ""}`;
  return (
    <section className="site-post site-post--index" lang={locale}>
      <header className="site-post__head">
        <h1 className="site-post__title">
          <span>{copy.title}</span>
        </h1>
      </header>
      {page.total === 0 ? (
        <p className="site-post__empty">{copy.empty}</p>
      ) : (
        <ul className="site-post__list">
          {page.items.map((p) => {
            const date = formatDate(p.publishedAt, locale);
            return (
              <li key={p.id} className="site-post__list-item">
                <Link href={postSiteHref(site, blogPostPath(p.slug), locale)}>{p.title}</Link>
                {date ? (
                  <p className="site-post__meta">
                    <time dateTime={p.publishedAt ?? undefined}>{date}</time>
                  </p>
                ) : null}
                {p.excerpt.trim() ? <p>{p.excerpt}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
      {page.totalPages > 1 ? (
        <nav className="site-post__pager" aria-label={copy.pageOf(page.page, page.totalPages)}>
          {page.hasPrev ? (
            <Link rel="prev" href={href(page.page - 1)}>
              {copy.newer}
            </Link>
          ) : null}
          <span>{copy.pageOf(page.page, page.totalPages)}</span>
          {page.hasNext ? (
            <Link rel="next" href={href(page.page + 1)}>
              {copy.older}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
