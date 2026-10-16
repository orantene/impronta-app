import "server-only";

/**
 * post-layout-data.ts — resolve the data each layout section needs for ONE post
 * page (Posts v1, TUL-1008). Pure orchestration over injectable sources, so the
 * tests run on typed fakes; `PostLayoutSections` only renders the result.
 */
import type { BlogCard } from "@/lib/cms/blog-index-cards";
import type { PostLayoutSection } from "@/lib/cms/post-layout";
import { loadPostAuthor, type PostAuthor, type PostAuthorSource } from "@/lib/cms/post-author";
import { loadLatestPostCards } from "@/lib/cms/posts-latest";
import { listPublicPosts, type PostScope, type PublicPostsDeps } from "@/lib/cms/posts-public";
import type { PublicPost } from "@/lib/cms/posts-public-model";

export type ResolvedPostLayoutSection =
  | { id: string; type: "post_content" }
  | { id: string; type: "post_author"; author: PostAuthor | null }
  | { id: string; type: "blog_index"; heading: string | null; cards: BlogCard[] };

export async function resolvePostLayoutData(input: {
  sections: readonly PostLayoutSection[];
  scope: PostScope;
  locale: string;
  postId: string;
  hrefFor: (slug: string) => string;
  authorSource: PostAuthorSource | null;
  deps?: PublicPostsDeps | null;
}): Promise<ResolvedPostLayoutSection[]> {
  const { sections, scope, locale, postId, hrefFor, authorSource, deps } = input;
  return Promise.all(
    sections.map(async (s): Promise<ResolvedPostLayoutSection> => {
      if (s.type === "post_content") return { id: s.id, type: "post_content" };
      if (s.type === "post_author") {
        const author = authorSource ? await loadPostAuthor(authorSource, scope, postId).catch(() => null) : null;
        return { id: s.id, type: "post_author", author };
      }
      const cards = await loadLatestPostCards({
        scope,
        locale,
        limit: s.limit,
        hrefFor,
        excludePostId: postId,
        deps,
      }).catch((): BlogCard[] => []);
      return { id: s.id, type: "blog_index", heading: s.heading ?? null, cards };
    }),
  );
}

// ---- builder preview ---------------------------------------------------------

const DEMO_POST_COPY = {
  es: {
    title: "Título de tu post",
    excerpt: "Así se verá el resumen de tus posts.",
    body: "Aquí va el contenido del post: texto, fotos, servicios y preguntas frecuentes.",
  },
  en: {
    title: "Your post title",
    excerpt: "This is how your post summary will look.",
    body: "The post content goes here: text, photos, services and FAQs.",
  },
} as const;

export function demoPreviewPost(locale: string): PublicPost {
  const c = DEMO_POST_COPY[locale === "es" ? "es" : "en"];
  return {
    id: "demo-post",
    locale: locale === "es" ? "es" : "en",
    slug: "demo",
    title: c.title,
    excerpt: c.excerpt,
    body: c.body,
    blocks: null,
    publishedAt: null,
    updatedAt: null,
    metaTitle: null,
    metaDescription: null,
    ogImageUrl: null,
    coverImageUrl: null,
    coverImageAlt: null,
    categoryId: null,
    translationOf: null,
    relatedOfferingId: null,
    isFeatured: false,
    isUnlisted: false,
    noindex: true,
    expiresAt: null,
  };
}

/**
 * The post the builder previews inside "Post content" when no post is open:
 * the site's latest published post, else demo text (`isDemo`).
 */
export async function resolvePreviewPost(
  scope: PostScope,
  locale: string,
  deps?: PublicPostsDeps | null,
): Promise<{ post: PublicPost; isDemo: boolean }> {
  const [latest] = await listPublicPosts(scope, locale, { limit: 1 }, deps).catch((): PublicPost[] => []);
  return latest ? { post: latest, isDemo: false } : { post: demoPreviewPost(locale), isDemo: true };
}
