/**
 * posts-public-model.ts — the PURE half of the Posts v1 public read model
 * (TUL-1009 public routes, TUL-1010 SEO / AI). No I/O, no `server-only`, so
 * every visibility rule is unit-tested with plain rows.
 *
 * VISIBILITY (design §2 "Status and expiry", §1.8 takedown)
 * ─────────────────────────────────────────────────────────
 *   listable  = published AND published_at <= now AND NOT is_unlisted
 *               AND NOT taken down AND NOT expired
 *   indexable = listable AND NOT noindex AND include_in_sitemap
 *               (sitemap + llms.txt read ONLY indexable rows)
 *
 *   by-slug state:
 *     missing row / never-published draft / future-dated  → not_found
 *     taken down, or unpublished after having been live   → unavailable
 *     expired (expires_at <= now)                         → expired (renders + notice, noindex)
 *     otherwise                                           → ok (noindex when noindex OR unlisted)
 *
 * The `/blog/*` path grammar, the `/posts/*` → `/blog/*` 301 mapping and the
 * JSON-LD / robots / llms.txt builders live here too, for the same reason.
 */

import { AI_CRAWLER_USER_AGENTS as SHARED_AI_AGENTS } from "@/lib/seo/robots-rules";
import type { MetadataRoute } from "next";

import { parsePostBlocks, type PostBlock } from "@/lib/cms/post-blocks";
import { buildFaqPageJsonLd, type FaqPageJsonLd } from "@/lib/cms/post-faq-jsonld";

// ---- rows ------------------------------------------------------------------

/** The cms_posts columns the public read model needs (Posts v1 migration). */
export type PublicPostRow = {
  id: string;
  tenant_id: string | null;
  talent_profile_id: string | null;
  locale: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  body_blocks: unknown;
  status: string;
  published_at: string | null;
  updated_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  noindex: boolean | null;
  include_in_sitemap: boolean | null;
  is_unlisted: boolean | null;
  is_featured: boolean | null;
  expires_at: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  category_id: string | null;
  translation_of: string | null;
  related_offering_id: string | null;
  taken_down_at: string | null;
};

export const PUBLIC_POST_COLUMNS =
  "id, tenant_id, talent_profile_id, locale, slug, title, excerpt, body, body_blocks, status, published_at, updated_at, meta_title, meta_description, og_image_url, noindex, include_in_sitemap, is_unlisted, is_featured, expires_at, cover_image_url, cover_image_alt, category_id, translation_of, related_offering_id, taken_down_at";

export type PublicPostCategoryRow = { id: string; slug: string; name: string; locale: string };

/** A post ready to render. Blocks are parsed; null = legacy `body` text. */
export type PublicPost = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  blocks: PostBlock[] | null;
  publishedAt: string | null;
  updatedAt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  categoryId: string | null;
  translationOf: string | null;
  relatedOfferingId: string | null;
  isFeatured: boolean;
  isUnlisted: boolean;
  noindex: boolean;
  expiresAt: string | null;
};

export function toPublicPost(row: PublicPostRow): PublicPost {
  return {
    id: row.id,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    body: row.body ?? "",
    blocks: row.body_blocks == null ? null : parsePostBlocks(row.body_blocks),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    ogImageUrl: row.og_image_url,
    coverImageUrl: row.cover_image_url,
    coverImageAlt: row.cover_image_alt,
    categoryId: row.category_id,
    translationOf: row.translation_of,
    relatedOfferingId: row.related_offering_id,
    isFeatured: row.is_featured === true,
    isUnlisted: row.is_unlisted === true,
    noindex: row.noindex === true,
    expiresAt: row.expires_at,
  };
}

// ---- visibility ------------------------------------------------------------

function ms(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function isPostExpired(row: Pick<PublicPostRow, "expires_at">, now: Date): boolean {
  const t = ms(row.expires_at);
  return t !== null && t <= now.getTime();
}

/** The columns the listable rule reads (lets cheap existence checks skip the post body). */
export type ListablePostFields = Pick<
  PublicPostRow,
  "status" | "taken_down_at" | "published_at" | "is_unlisted" | "expires_at"
>;

function isLive(row: Pick<PublicPostRow, "status" | "taken_down_at" | "published_at">, now: Date): boolean {
  if (row.status !== "published" || row.taken_down_at) return false;
  const pub = ms(row.published_at);
  return pub === null || pub <= now.getTime();
}

/** In lists / category pages / `blog_index`. */
export function isListablePost(row: ListablePostFields, now: Date): boolean {
  return isLive(row, now) && row.is_unlisted !== true && !isPostExpired(row, now);
}

/** In the sitemap and llms.txt. */
export function isIndexablePost(row: PublicPostRow, now: Date): boolean {
  return isListablePost(row, now) && row.noindex !== true && row.include_in_sitemap !== false;
}

export function sortPostsNewestFirst<T extends Pick<PublicPostRow, "published_at" | "is_featured">>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => (ms(b.published_at) ?? 0) - (ms(a.published_at) ?? 0));
}

export type PublicPostState =
  | { state: "ok"; post: PublicPost; noindex: boolean }
  | { state: "expired"; post: PublicPost; noindex: true }
  | { state: "unavailable"; noindex: true }
  | { state: "not_found" };

export function classifyPublicPost(row: PublicPostRow | null, now: Date): PublicPostState {
  if (!row) return { state: "not_found" };
  if (row.taken_down_at) return { state: "unavailable", noindex: true };
  if (row.status !== "published") {
    // Was live once (published_at set in the past) → soft page; a draft that
    // never went live must not reveal that the slug exists.
    const pub = ms(row.published_at);
    return pub !== null && pub <= now.getTime() ? { state: "unavailable", noindex: true } : { state: "not_found" };
  }
  if (!isLive(row, now)) return { state: "not_found" }; // future-dated
  const post = toPublicPost(row);
  if (isPostExpired(row, now)) return { state: "expired", post, noindex: true };
  return { state: "ok", post, noindex: post.noindex || post.isUnlisted };
}

export const POST_EXPIRED_NOTICE = {
  es: "Esta información ya no está vigente",
  en: "This information is no longer current",
} as const;

export const POST_UNAVAILABLE_COPY = {
  es: { title: "Esta publicación ya no está disponible", body: "Puede que se haya retirado o movido.", home: "Ir al inicio" },
  en: { title: "This post is no longer available", body: "It may have been removed or moved.", home: "Go to the home page" },
} as const;

export function postCopyLocale(locale: string): "es" | "en" {
  return locale === "es" ? "es" : "en";
}

// ---- paths -----------------------------------------------------------------

export const BLOG_PATH = "/blog";

export function blogPostPath(slug: string): string {
  return `${BLOG_PATH}/${encodeURIComponent(slug)}`;
}

export function blogCategoryPath(categorySlug: string): string {
  return `${BLOG_PATH}/c/${encodeURIComponent(categorySlug)}`;
}

const LEGACY_POST_PATH = /^(\/[a-z]{2}(?:-[a-z]{2})?)?\/posts\/([^/]+)\/?$/i;

/**
 * `/posts/<slug>` (optionally behind a locale prefix) → `/blog/<slug>`, for the
 * 301. Returns null for anything else (a bare `/posts` has no blog index route).
 */
export function legacyPostsPathToBlog(pathname: string): string | null {
  const m = LEGACY_POST_PATH.exec(pathname);
  if (!m) return null;
  const prefix = m[1] ?? "";
  return `${prefix}${BLOG_PATH}/${m[2]}`;
}

/**
 * Pick the slug-change redirect for `/blog/<slug>`. Rows come from the scoped
 * `cms_redirects` read; only active 301/302 rows whose destination stays on
 * the blog count, and a self-loop is ignored.
 */
export type PostRedirectRow = { old_path: string; new_path: string; status_code: number | null; active: boolean | null };

export function pickPostSlugRedirect(rows: readonly PostRedirectRow[], slug: string): string | null {
  const from = blogPostPath(slug);
  for (const row of rows) {
    if (row.active === false) continue;
    if (row.old_path !== from && row.old_path !== `${BLOG_PATH}/${slug}`) continue;
    const to = row.new_path?.trim();
    if (!to || to === from || !to.startsWith("/")) continue;
    return to;
  }
  return null;
}

// ---- hreflang via translation_of --------------------------------------------

/**
 * The translation group of `post`: itself, the post it translates, and every
 * other post that translates the same root. Only rows that are live and not
 * expired / unlisted / taken down are named as alternates.
 */
export function postTranslationAlternates(
  post: Pick<PublicPost, "id" | "translationOf" | "locale" | "slug">,
  candidates: readonly PublicPostRow[],
  now: Date,
): Array<{ locale: string; slug: string }> {
  const root = post.translationOf ?? post.id;
  const out = new Map<string, string>([[post.locale, post.slug]]);
  for (const row of candidates) {
    if (row.id === post.id) continue;
    const inGroup = row.id === root || row.translation_of === root;
    if (!inGroup || !isListablePost(row, now) || out.has(row.locale)) continue;
    out.set(row.locale, row.slug);
  }
  return [...out].map(([locale, slug]) => ({ locale, slug }));
}

// ---- JSON-LD ----------------------------------------------------------------

export type BlogPostingJsonLd = {
  "@context": "https://schema.org";
  "@type": "BlogPosting";
  headline: string;
  description?: string;
  datePublished: string;
  dateModified: string;
  author: { "@type": "Person" | "Organization"; name: string; url?: string };
  publisher?: { "@type": "Organization" | "Person"; name: string };
  image: string[];
  mainEntityOfPage: { "@type": "WebPage"; "@id": string };
  inLanguage: string;
  url: string;
};

export type BreadcrumbListJsonLd = {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{ "@type": "ListItem"; position: number; name: string; item: string }>;
};

export type PostJsonLdInput = {
  post: PublicPost;
  url: string;
  imageUrl: string;
  author: { name: string; kind: "person" | "organization"; url?: string };
  siteName: string;
  homeUrl: string;
  blogLabel: string;
  category?: { name: string; url: string } | null;
};

export function postSeoTitle(post: Pick<PublicPost, "metaTitle" | "title">): string {
  return post.metaTitle?.trim() || post.title;
}

export function postSeoDescription(post: Pick<PublicPost, "metaDescription" | "excerpt">): string | undefined {
  return post.metaDescription?.trim() || post.excerpt.trim() || undefined;
}

export function buildBlogPostingJsonLd(input: PostJsonLdInput): BlogPostingJsonLd {
  const { post } = input;
  const published = post.publishedAt ?? post.updatedAt ?? new Date(0).toISOString();
  const description = postSeoDescription(post);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title.slice(0, 110),
    ...(description ? { description } : {}),
    datePublished: published,
    dateModified: post.updatedAt ?? published,
    author: {
      "@type": input.author.kind === "person" ? "Person" : "Organization",
      name: input.author.name,
      ...(input.author.url ? { url: input.author.url } : {}),
    },
    publisher: { "@type": input.author.kind === "person" ? "Person" : "Organization", name: input.siteName },
    image: [input.imageUrl],
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    inLanguage: post.locale,
    url: input.url,
  };
}

export function buildPostBreadcrumbJsonLd(input: PostJsonLdInput): BreadcrumbListJsonLd {
  const items: Array<{ name: string; item: string }> = [
    { name: input.siteName, item: input.homeUrl },
  ];
  if (input.category) items.push({ name: input.category.name, item: input.category.url });
  items.push({ name: input.post.title, item: input.url });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.item })),
  };
}

/** BlogPosting + BreadcrumbList, plus FAQPage when the post has answered FAQ blocks. */
export function buildPostJsonLd(
  input: PostJsonLdInput,
): Array<BlogPostingJsonLd | BreadcrumbListJsonLd | FaqPageJsonLd> {
  const out: Array<BlogPostingJsonLd | BreadcrumbListJsonLd | FaqPageJsonLd> = [
    buildBlogPostingJsonLd(input),
    buildPostBreadcrumbJsonLd(input),
  ];
  const faq = input.post.blocks ? buildFaqPageJsonLd(input.post.blocks) : null;
  if (faq) out.push(faq);
  return out;
}

/** `<script type="application/ld+json">` payload; `<` escaped so a title can't close the tag. */
export function jsonLdScriptString(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// ---- sitemap + llms.txt ------------------------------------------------------

export type LocalizedUrl = (path: string, locale: string) => string;

/**
 * Sitemap entries for INDEXABLE posts. Each entry names its translations
 * (from `translation_of`) as hreflang alternates.
 */
export function postSitemapEntries(
  rows: readonly PublicPostRow[],
  urlFor: LocalizedUrl,
  now: Date,
): MetadataRoute.Sitemap {
  const indexable = rows.filter((r) => isIndexablePost(r, now));
  return indexable.map((row) => {
    const post = toPublicPost(row);
    const alts = postTranslationAlternates(post, indexable, now);
    const languages = alts.length > 1
      ? Object.fromEntries(alts.map((a) => [a.locale, urlFor(blogPostPath(a.slug), a.locale)]))
      : null;
    const last = row.updated_at ?? row.published_at;
    return {
      url: urlFor(blogPostPath(row.slug), row.locale),
      lastModified: last ? new Date(last) : now,
      ...(languages ? { alternates: { languages } } : {}),
    };
  });
}

/** Indexable posts as llms.txt links (shared by the site and talent composers). */
export function llmsPostLinks(
  rows: readonly PublicPostRow[],
  urlFor: LocalizedUrl,
  now: Date,
): { title: string; url: string; description: string }[] {
  return sortPostsNewestFirst(rows.filter((r) => isIndexablePost(r, now))).map((row) => ({
    title: oneLine(row.title),
    url: urlFor(blogPostPath(row.slug), row.locale),
    description: oneLine(row.meta_description || row.excerpt || ""),
  }));
}

/** The llms.txt body (https://llmstxt.org): site title, summary, then the post list. */
export function buildLlmsTxt(input: {
  siteName: string;
  summary?: string | null;
  homeUrl: string;
  posts: readonly PublicPostRow[];
  urlFor: LocalizedUrl;
  now: Date;
}): string {
  const lines: string[] = [`# ${oneLine(input.siteName) || "Website"}`, ""];
  const summary = oneLine(input.summary ?? "");
  if (summary) lines.push(`> ${summary}`, "");
  lines.push(`- [Home](${input.homeUrl})`, "");
  const posts = llmsPostLinks(input.posts, input.urlFor, input.now);
  if (posts.length > 0) {
    lines.push("## Posts", "");
    for (const p of posts) {
      lines.push(`- [${p.title}](${p.url})${p.description ? `: ${p.description}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[[\]]/g, "").trim();
}

// ---- robots (AI crawler toggle) ---------------------------------------------

/** The one shared AI bot list (training + answer agents) blocked when "IA puede leer mi sitio" is OFF. */
export { AI_CRAWLER_USER_AGENTS } from "@/lib/seo/robots-rules";

type RobotsGroup = Extract<MetadataRoute.Robots["rules"], unknown[]>[number];

/**
 * Apply the site's AI toggle to a built robots policy. ON → unchanged. OFF →
 * the AI crawlers are removed from any allow group and get their own
 * `Disallow: /` group.
 */
export function applyAiCrawlerToggle(robots: MetadataRoute.Robots, aiCrawlersAllowed: boolean): MetadataRoute.Robots {
  if (aiCrawlersAllowed) return robots;
  const blocked = new Set<string>(SHARED_AI_AGENTS);
  const rules = (Array.isArray(robots.rules) ? robots.rules : [robots.rules]).flatMap((rule): RobotsGroup[] => {
    const agents = Array.isArray(rule.userAgent) ? rule.userAgent : rule.userAgent ? [rule.userAgent] : [];
    // A group with no user agent applies to every crawler, which is "*".
    if (agents.length === 0) return [{ ...rule, userAgent: "*" }];
    const kept = agents.filter((a) => !blocked.has(a));
    if (kept.length === agents.length) return [{ ...rule, userAgent: agents }];
    return kept.length > 0 ? [{ ...rule, userAgent: kept }] : [];
  });
  rules.push({ userAgent: [...SHARED_AI_AGENTS], disallow: "/" });
  return { ...robots, rules };
}
