import "server-only";

/**
 * posts-writer-read.ts — Posts v1 READ path for the writer and the list.
 *
 * Mirror of `posts-writer.ts` for reads: every cms_posts / cms_post_categories
 * query goes through the scoped builders (`tenantScopedQuery` for a workspace
 * owner, `talentScopedQuery` for a talent personal site). No raw
 * `.from("cms_posts")` here; the owner scope is resolved by the caller from the
 * session (`resolvePostScope`), never from client input.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePostBlocks } from "@/lib/cms/post-blocks";
import { isPristineDraft } from "@/lib/cms/post-writer-status";
import { evaluatePostSeo } from "@/lib/cms/post-seo-dot";
import type {
  PostListRow,
  WriterCategory,
  WriterOffering,
  WriterPostData,
} from "@/lib/cms/post-writer-types";
import { isPostLocale, type PostLocale } from "@/lib/cms/posts-shared";
import type { PostScope } from "@/lib/cms/posts-writer";
import { logServerError } from "@/lib/server/safe-error";
import { talentScopedQuery } from "@/lib/supabase/talent-scoped-query";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

function scoped(supabase: SupabaseClient, table: "cms_posts" | "cms_post_categories", scope: PostScope) {
  return scope.kind === "tenant"
    ? tenantScopedQuery(supabase, table, scope.tenantId)
    : talentScopedQuery(supabase, table, scope.talentProfileId);
}

type FullRow = {
  id: string;
  locale: string;
  status: string;
  slug: string;
  title: string | null;
  excerpt: string | null;
  body_blocks: unknown;
  published_at: string | null;
  scheduled_publish_at: string | null;
  category_id: string | null;
  is_featured: boolean | null;
  is_unlisted: boolean | null;
  expires_at: string | null;
  related_offering_id: string | null;
  meta_title: string | null;
  meta_description: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  og_image_url: string | null;
  noindex: boolean | null;
  taken_down_at: string | null;
  taken_down_reason: string | null;
  updated_at: string | null;
};

const FULL_COLUMNS =
  "id, locale, status, slug, title, excerpt, body_blocks, published_at, scheduled_publish_at, category_id, is_featured, is_unlisted, expires_at, related_offering_id, meta_title, meta_description, cover_image_url, cover_image_alt, og_image_url, noindex, taken_down_at, taken_down_reason, updated_at";

function toWriterPost(row: FullRow): WriterPostData {
  return {
    id: row.id,
    locale: isPostLocale(row.locale) ? row.locale : "es",
    status: row.status,
    slug: row.slug,
    title: row.title ?? "",
    excerpt: row.excerpt ?? "",
    blocks: parsePostBlocks(row.body_blocks),
    publishedAt: row.published_at,
    scheduledPublishAt: row.scheduled_publish_at,
    categoryId: row.category_id,
    isFeatured: row.is_featured === true,
    isUnlisted: row.is_unlisted === true,
    expiresAt: row.expires_at,
    relatedOfferingId: row.related_offering_id,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    coverImageUrl: row.cover_image_url,
    coverImageAlt: row.cover_image_alt,
    ogImageUrl: row.og_image_url,
    noindex: row.noindex === true,
    takenDownReason: row.taken_down_reason,
    takenDown: row.taken_down_at !== null,
    updatedAt: row.updated_at,
  };
}

/** One post for the writer, or null when it is not in this owner's scope. */
export async function loadPostForWriter(
  supabase: SupabaseClient,
  scope: PostScope,
  postId: string,
): Promise<WriterPostData | null> {
  const { data, error } = await scoped(supabase, "cms_posts", scope)
    .select(FULL_COLUMNS)
    .eq("id", postId)
    .maybeSingle<FullRow>();
  if (error) {
    logServerError("cms/posts-writer-read/load", error);
    return null;
  }
  return data ? toWriterPost(data) : null;
}

/** The owner's posts, newest edit first, with the SEO dot level computed. */
export async function listPostsForOwner(
  supabase: SupabaseClient,
  scope: PostScope,
  limit = 200,
): Promise<PostListRow[]> {
  const { data, error } = await scoped(supabase, "cms_posts", scope)
    .select(FULL_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    logServerError("cms/posts-writer-read/list", error);
    return [];
  }
  return ((data ?? []) as FullRow[])
    // TUL-1249: a click on "new post" stores an empty draft; it is not the owner's work yet.
    .filter(
      (row) =>
        !isPristineDraft({
          status: row.status,
          title: row.title,
          excerpt: row.excerpt,
          blockCount: parsePostBlocks(row.body_blocks).length,
          scheduledPublishAt: row.scheduled_publish_at,
          isUnlisted: row.is_unlisted,
          isFeatured: row.is_featured,
          expiresAt: row.expires_at,
          categoryId: row.category_id,
          relatedOfferingId: row.related_offering_id,
          metaTitle: row.meta_title,
          metaDescription: row.meta_description,
          coverImageUrl: row.cover_image_url,
          ogImageUrl: row.og_image_url,
        }),
    )
    .map((row) => {
    const post = toWriterPost(row);
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      locale: post.locale,
      status: post.status,
      isUnlisted: post.isUnlisted,
      takenDown: post.takenDown,
      takenDownReason: post.takenDownReason,
      scheduledPublishAt: post.scheduledPublishAt,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      seoLevel: evaluatePostSeo({
        title: post.title,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        coverImageUrl: post.coverImageUrl,
        coverImageAlt: post.coverImageAlt,
        relatedOfferingId: post.relatedOfferingId,
        blocks: post.blocks,
      }).level,
    };
  });
}

/** Existing categories for a language (one per post). Creating one is not offered in v1. */
export async function listPostCategories(
  supabase: SupabaseClient,
  scope: PostScope,
  locale: PostLocale,
): Promise<WriterCategory[]> {
  const { data, error } = await scoped(supabase, "cms_post_categories", scope)
    .select("id, name")
    .eq("locale", locale)
    .order("position", { ascending: true });
  if (error) {
    logServerError("cms/posts-writer-read/categories", error);
    return [];
  }
  return ((data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
}

/** The talent's own published services, for the Servicio block picker. */
export async function listTalentOfferings(
  supabase: SupabaseClient,
  talentProfileId: string,
  locale: PostLocale,
): Promise<WriterOffering[]> {
  const { data, error } = await supabase
    .from("talent_offerings")
    .select("id, title, title_i18n")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(100);
  if (error) {
    logServerError("cms/posts-writer-read/offerings", error);
    return [];
  }
  return ((data ?? []) as { id: string; title: string | null; title_i18n: Record<string, string | null> | null }[])
    .map((o) => ({ id: o.id, name: (o.title_i18n?.[locale] ?? o.title ?? "").trim() }))
    .filter((o) => o.name.length > 0);
}

/** The workspace's own published services, for the Servicio block picker (workspace scope). */
export async function listWorkspaceOfferings(
  supabase: SupabaseClient,
  tenantId: string,
  locale: PostLocale,
): Promise<WriterOffering[]> {
  const { data, error } = await tenantScopedQuery(supabase, "talent_offerings", tenantId)
    .select("id, title, title_i18n")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(100);
  if (error) {
    logServerError("cms/posts-writer-read/workspace-offerings", error);
    return [];
  }
  return ((data ?? []) as { id: string; title: string | null; title_i18n: Record<string, string | null> | null }[])
    .map((o) => ({ id: o.id, name: (o.title_i18n?.[locale] ?? o.title ?? "").trim() }))
    .filter((o) => o.name.length > 0);
}
