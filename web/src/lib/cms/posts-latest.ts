import "server-only";

/**
 * posts-latest.ts — the live "Últimos posts" cards (Posts v1, TUL-1008).
 *
 * Reads through `listPublicPosts` (listable only: no drafts, unlisted, expired
 * or taken-down) for the current site scope, tenant or talent. The data source
 * is injectable, so the tests use the same typed fakes as the public read model.
 */
import type { BlogCard } from "@/lib/cms/blog-index-cards";
import {
  listPublicPosts,
  loadPostCategory,
  type PostScope,
  type PublicPostsDeps,
} from "@/lib/cms/posts-public";
import type { PublicPost } from "@/lib/cms/posts-public-model";

export function formatPostCardDate(iso: string | null, locale: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", { dateStyle: "medium" }).format(d);
}

export type LoadLatestPostCardsInput = {
  scope: PostScope;
  locale: string;
  limit: number;
  categorySlug?: string;
  /** Origin-relative href of a post, in the site's URL grammar. */
  hrefFor: (slug: string) => string;
  /** Skip this post (the "more posts" list on a post page). */
  excludePostId?: string;
  deps?: PublicPostsDeps | null;
};

export async function loadLatestPosts(input: LoadLatestPostCardsInput): Promise<PublicPost[]> {
  const { scope, locale, limit, categorySlug, excludePostId, deps } = input;
  // One extra row so excluding the current post still fills the list.
  const want = Math.max(1, limit) + (excludePostId ? 1 : 0);
  const posts = await listPublicPosts(scope, locale, { limit: want, ...(categorySlug ? { categorySlug } : {}) }, deps);
  return posts.filter((p) => p.id !== excludePostId).slice(0, Math.max(1, limit));
}

export async function loadLatestPostCards(input: LoadLatestPostCardsInput): Promise<BlogCard[]> {
  const posts = await loadLatestPosts(input);
  if (posts.length === 0) return [];
  const categoryIds = [...new Set(posts.flatMap((p) => (p.categoryId ? [p.categoryId] : [])))];
  const names = new Map<string, string>();
  await Promise.all(
    categoryIds.map(async (id) => {
      const cat = await loadPostCategory(input.scope, { id }, input.deps).catch(() => null);
      if (cat) names.set(id, cat.name);
    }),
  );
  return posts.map((p) => {
    const date = formatPostCardDate(p.publishedAt, input.locale);
    const category = p.categoryId ? names.get(p.categoryId) : undefined;
    return {
      title: p.title,
      href: input.hrefFor(p.slug),
      ...(p.excerpt.trim() ? { excerpt: p.excerpt } : {}),
      ...(date ? { date } : {}),
      ...(category ? { category } : {}),
      ...(p.coverImageUrl ? { imageUrl: p.coverImageUrl, imageAlt: p.coverImageAlt ?? "" } : {}),
    };
  });
}
