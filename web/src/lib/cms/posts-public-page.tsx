import "server-only";

/**
 * posts-public-page.tsx — the `/blog/<slug>` and `/blog/c/<category>` page
 * logic shared by BOTH site families. The route files only pick the site
 * (workspace vs talent) and the chrome around the article.
 *
 * HTTP STATE MAPPING
 *   ok          → 200, indexable unless noindex / unlisted
 *   expired     → 200 + "Esta información ya no está vigente" notice, noindex
 *   unavailable → notFound() → 404 + noindex, rendered by the segment's
 *                 `not-found.tsx` as the soft "ya no está disponible" page
 *   not_found   → slug-change 301 when a scoped cms_redirects row exists,
 *                 else the same soft 404
 *
 * WHY 404 AND NOT 410 for "unavailable": an App Router page cannot set a 410
 * (only notFound()/redirect()), and doing it in the proxy would add a DB read
 * to every request. Google treats 404 and 410 the same for de-indexing
 * (410 only marginally faster), and one status for both "never existed" and
 * "taken down" avoids confirming that a taken-down slug ever existed.
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PostBody } from "@/components/posts/PostBlocksRenderer";
import { readingMinutes } from "@/lib/cms/post-blocks";
import {
  blogCategoryPath,
  blogPostPath,
  buildPostJsonLd,
  jsonLdScriptString,
  POST_EXPIRED_NOTICE,
  POST_UNAVAILABLE_COPY,
  postCopyLocale,
  postSeoDescription,
  postSeoTitle,
  postTranslationAlternates,
  type PublicPost,
  type PublicPostState,
} from "@/lib/cms/posts-public-model";
import {
  createScopedOfferingLoader,
  getPublicPostBySlug,
  listPublicPosts,
  loadPostCategory,
  loadPostTranslationRows,
  resolvePostServices,
  resolvePostSlugRedirect,
} from "@/lib/cms/posts-public";
import { postSiteHref, postSiteUrlFor, type PostSiteContext } from "@/lib/cms/posts-public-site";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type LoadedPostPage =
  | { kind: "render"; state: Extract<PublicPostState, { state: "ok" | "expired" }>; post: PublicPost }
  | { kind: "redirect"; to: string }
  | { kind: "not_found" };

/** Resolve a `/blog/<slug>` request. Never throws. */
export async function loadPostPage(site: PostSiteContext, locale: string, slug: string): Promise<LoadedPostPage> {
  const state = await getPublicPostBySlug(site.scope, locale, slug).catch((): PublicPostState => ({ state: "not_found" }));
  if (state.state === "ok" || state.state === "expired") return { kind: "render", state, post: state.post };
  if (state.state === "not_found") {
    const to = await resolvePostSlugRedirect(site.scope, slug).catch(() => null);
    if (to) return { kind: "redirect", to: postSiteHref(site, to, locale) };
  }
  return { kind: "not_found" };
}

/** OG image: the cover / explicit OG image, else the auto card route. */
export function postOgImageUrl(site: PostSiteContext, post: PublicPost): string {
  const explicit = post.ogImageUrl?.trim() || post.coverImageUrl?.trim();
  if (explicit) return explicit;
  return `${postSiteUrlFor(site)(blogPostPath(post.slug), post.locale)}/og`;
}

export async function buildPostMetadata(site: PostSiteContext, locale: string, slug: string): Promise<Metadata> {
  const loaded = await loadPostPage(site, locale, slug);
  if (loaded.kind !== "render") return { robots: { index: false, follow: false } };
  const { post, state } = loaded;
  const urlFor = postSiteUrlFor(site);
  const canonical = urlFor(blogPostPath(post.slug), post.locale);
  const translations = await loadPostTranslationRows(site.scope, post).catch(() => []);
  const alts = postTranslationAlternates(post, translations, new Date());
  const languages =
    alts.length > 1 ? Object.fromEntries(alts.map((a) => [a.locale, urlFor(blogPostPath(a.slug), a.locale)])) : undefined;
  const title = postSeoTitle(post);
  const description = postSeoDescription(post);
  const image = postOgImageUrl(site, post);
  return {
    title,
    description,
    alternates: { canonical, ...(languages ? { languages } : {}) },
    robots: state.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      siteName: site.siteName,
      locale: post.locale,
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
      ...(post.updatedAt ? { modifiedTime: post.updatedAt } : {}),
      images: [{ url: image, ...(post.coverImageAlt ? { alt: post.coverImageAlt } : {}) }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", { dateStyle: "long" }).format(d);
}

/** The themed article (+ JSON-LD). Classes are the theme's `.site-post*` set. */
export async function PostArticleView(props: {
  site: PostSiteContext;
  post: PublicPost;
  expired: boolean;
  locale: string;
}): Promise<ReactNode> {
  const { site, post, locale } = props;
  const copyLocale = postCopyLocale(locale);
  const db = createServiceRoleClient();
  const [services, category] = await Promise.all([
    db ? resolvePostServices(post.blocks, locale, createScopedOfferingLoader(db, site.scope)).catch(() => ({})) : {},
    post.categoryId ? loadPostCategory(site.scope, { id: post.categoryId }).catch(() => null) : null,
  ]);
  const urlFor = postSiteUrlFor(site);
  const url = urlFor(blogPostPath(post.slug), post.locale);
  const homePath = postSiteHref(site, "/", locale);
  const jsonLd = buildPostJsonLd({
    post,
    url,
    imageUrl: postOgImageUrl(site, post),
    author: { name: site.siteName, kind: site.authorKind, url: urlFor("/", locale) },
    siteName: site.siteName,
    homeUrl: urlFor("/", locale),
    blogLabel: "Blog",
    category: category ? { name: category.name, url: urlFor(blogCategoryPath(category.slug), locale) } : null,
  });
  const date = formatDate(post.publishedAt, locale);
  const minutes = post.blocks ? readingMinutes(post.blocks) : null;
  return (
    <article className="site-post" data-post-id={post.id} lang={post.locale}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptString(jsonLd) }} />
      {props.expired ? (
        <p className="site-post__notice" role="status">
          {POST_EXPIRED_NOTICE[copyLocale]}
        </p>
      ) : null}
      <header className="site-post__head">
        <p className="site-post__meta">
          {category ? (
            <Link href={postSiteHref(site, blogCategoryPath(category.slug), locale)}>{category.name}</Link>
          ) : null}
          {category && date ? " · " : null}
          {date ? <time dateTime={post.publishedAt ?? undefined}>{date}</time> : null}
          {minutes ? ` · ${minutes} min` : null}
        </p>
        <h1 className="site-post__title">
          <span>{post.title}</span>
        </h1>
        {post.excerpt.trim() ? (
          <p className="site-post__byline">
            <span>{post.excerpt}</span>
          </p>
        ) : null}
      </header>
      {post.coverImageUrl ? (
        <figure className="site-post__hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.coverImageUrl} alt={post.coverImageAlt ?? ""} />
        </figure>
      ) : null}
      <PostBody blocks={post.blocks} body={post.body} services={services} homePath={homePath} locale={locale} />
    </article>
  );
}

/** `/blog/c/<category>`: the category's listable posts. Null → 404. */
export async function PostCategoryView(props: {
  site: PostSiteContext;
  locale: string;
  categorySlug: string;
}): Promise<ReactNode | null> {
  const { site, locale } = props;
  const category = await loadPostCategory(site.scope, { locale, slug: props.categorySlug.trim().toLowerCase() }).catch(() => null);
  if (!category) return null;
  const posts = await listPublicPosts(site.scope, locale, { categorySlug: category.slug }).catch(() => []);
  return (
    <section className="site-post site-post--index" lang={locale}>
      <header className="site-post__head">
        <h1 className="site-post__title">
          <span>{category.name}</span>
        </h1>
      </header>
      <ul className="site-post__list">
        {posts.map((p) => (
          <li key={p.id} className="site-post__list-item">
            <Link href={postSiteHref(site, blogPostPath(p.slug), locale)}>{p.title}</Link>
            {p.excerpt.trim() ? <p>{p.excerpt}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function buildCategoryMetadata(site: PostSiteContext, locale: string, categorySlug: string): Promise<Metadata> {
  const category = await loadPostCategory(site.scope, { locale, slug: categorySlug.trim().toLowerCase() }).catch(() => null);
  if (!category) return { robots: { index: false, follow: false } };
  const canonical = postSiteUrlFor(site)(blogCategoryPath(category.slug), locale);
  return { title: `${category.name} · ${site.siteName}`, alternates: { canonical } };
}

/** The soft "ya no está disponible" page (rendered by the `/blog/<slug>` not-found segment). */
export function PostUnavailableView(props: { locale: string; homeHref: string }): ReactNode {
  const copy = POST_UNAVAILABLE_COPY[postCopyLocale(props.locale)];
  return (
    <section className="site-post site-post--unavailable" lang={props.locale}>
      <h1 className="site-post__title">
        <span>{copy.title}</span>
      </h1>
      <p>{copy.body}</p>
      <p>
        <Link className="site-btn site-btn--primary" href={props.homeHref}>
          {copy.home}
        </Link>
      </p>
    </section>
  );
}
