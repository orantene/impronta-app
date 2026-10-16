import "server-only";

/**
 * posts-widget-query.ts: the query layer of the `posts_feed` builder widget
 * (Posts v1, PO1). Same listability rule as `listPublicPosts`
 * (`isListablePost`: no drafts, unlisted, expired or taken-down posts) plus the
 * widget's own filters: source (latest / featured / hand-picked in order),
 * category, excluded ids, sort, limit and page offset.
 *
 * The data source is injectable (`PostsWidgetSource`) so tests use typed fakes;
 * `createSupabasePostsWidgetSource` is the owner-scoped production reader
 * (tenant_id OR talent_profile_id through the scoped query helpers). The pure
 * selection (`selectPostsWidgetRows`) carries every rule.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePostBlocks, readingMinutes } from "@/lib/cms/post-blocks";
import { formatPostCardDate } from "@/lib/cms/posts-latest";
import {
  PUBLIC_POST_COLUMNS,
  blogPostPath,
  isListablePost,
  type PublicPostCategoryRow,
  type PublicPostRow,
} from "@/lib/cms/posts-public-model";
import type { PostScope } from "@/lib/cms/posts-writer";
import { logServerError } from "@/lib/server/safe-error";
import { talentScopedQuery } from "@/lib/supabase/talent-scoped-query";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import {
  type PostsFeedCard,
  type PostsFeedNodeData,
  type PostsFeedSort,
  type PostsFeedSource,
} from "@/lib/site-admin/builder-node/posts-feed-model";

export type PostsWidgetRow = PublicPostRow;

export const POSTS_WIDGET_COLUMNS = PUBLIC_POST_COLUMNS;

export interface PostsWidgetSource {
  /** Published, not-taken-down rows of one locale, owner-scoped. The pure filter does the rest. */
  listPublished(scope: PostScope, locale: string): Promise<PostsWidgetRow[]>;
  /** Categories of the scope (for card labels and the inspector picker). */
  listCategories(scope: PostScope, locale: string): Promise<PublicPostCategoryRow[]>;
}

export type PostsWidgetQuery = {
  source: PostsFeedSource;
  /** hand_picked: ids in display order. */
  postIds?: readonly string[];
  categoryId?: string | null;
  excludeIds?: readonly string[];
  sort: PostsFeedSort;
  /** Cards per page. */
  limit: number;
  /** 0-based offset. */
  offset?: number;
};

function ms(value: string | null): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * PURE. Listable rows → the rows one page of the widget shows, plus the total
 * that matched (before limit / offset) for page counts.
 */
export function selectPostsWidgetRows(
  rows: readonly PostsWidgetRow[],
  query: PostsWidgetQuery,
  now: Date,
): { rows: PostsWidgetRow[]; total: number } {
  const exclude = new Set(query.excludeIds ?? []);
  const listable = rows.filter((r) => isListablePost(r, now) && !exclude.has(r.id));

  let matched: PostsWidgetRow[];
  if (query.source === "hand_picked") {
    // Hand-picked: exactly the chosen posts, in the chosen order. Filters and
    // sort do not reorder a curated list; listability still applies.
    const byId = new Map(listable.map((r) => [r.id, r]));
    matched = [];
    for (const id of query.postIds ?? []) {
      const row = byId.get(id);
      if (row && !matched.includes(row)) matched.push(row);
    }
  } else {
    matched = listable.filter((r) => {
      if (query.source === "featured" && r.is_featured !== true) return false;
      if (query.source === "category" && !query.categoryId) return false;
      if (query.categoryId && r.category_id !== query.categoryId) return false;
      return true;
    });
    matched = sortWidgetRows(matched, query.sort);
  }

  const limit = Math.max(1, Math.trunc(query.limit));
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  return { rows: matched.slice(offset, offset + limit), total: matched.length };
}

function sortWidgetRows(rows: readonly PostsWidgetRow[], sort: PostsFeedSort): PostsWidgetRow[] {
  const newest = (a: PostsWidgetRow, b: PostsWidgetRow) => ms(b.published_at) - ms(a.published_at);
  const copy = [...rows];
  if (sort === "oldest") return copy.sort((a, b) => -newest(a, b));
  if (sort === "featured_first") {
    return copy.sort((a, b) => Number(b.is_featured === true) - Number(a.is_featured === true) || newest(a, b));
  }
  return copy.sort(newest);
}

/** Reading minutes from blocks, else the legacy text body at 200 wpm. */
export function postsWidgetReadingMinutes(row: Pick<PublicPostRow, "body" | "body_blocks">): number {
  if (row.body_blocks != null) return readingMinutes(parsePostBlocks(row.body_blocks));
  const words = (row.body ?? "").trim() ? (row.body ?? "").trim().split(/\s+/u).length : 0;
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
}

export function toPostsFeedCard(
  row: PostsWidgetRow,
  ctx: { locale: string; categoryNames: ReadonlyMap<string, string>; author?: string | null },
): PostsFeedCard {
  const date = formatPostCardDate(row.published_at, ctx.locale);
  const category = row.category_id ? ctx.categoryNames.get(row.category_id) : undefined;
  const minutes = postsWidgetReadingMinutes(row);
  const excerpt = (row.excerpt ?? "").trim();
  return {
    id: row.id,
    path: blogPostPath(row.slug),
    title: row.title,
    ...(excerpt ? { excerpt } : {}),
    ...(date ? { date } : {}),
    ...(category ? { category } : {}),
    ...(row.cover_image_url ? { imageUrl: row.cover_image_url, imageAlt: row.cover_image_alt ?? "" } : {}),
    ...(minutes > 0 ? { readingMinutes: minutes } : {}),
    ...(ctx.author ? { author: ctx.author } : {}),
    ...(row.is_featured === true ? { featured: true } : {}),
  };
}

export type PostsWidgetDeps = { source: PostsWidgetSource; now?: () => Date };

/**
 * One node's cards. Loads the scope's listable rows once per call; callers
 * with several nodes on a page pass a memoised source (see posts-feed-sources).
 */
export async function loadPostsWidgetCards(input: {
  scope: PostScope;
  locale: string;
  query: PostsWidgetQuery;
  deps: PostsWidgetDeps;
  author?: string | null;
}): Promise<PostsFeedNodeData> {
  const { scope, locale, query, deps } = input;
  const now = deps.now ? deps.now() : new Date();
  const rows = await deps.source.listPublished(scope, locale);
  const picked = selectPostsWidgetRows(rows, query, now);
  if (picked.rows.length === 0) return { cards: [], total: picked.total };
  const needsCategories = picked.rows.some((r) => r.category_id);
  const categories = needsCategories ? await deps.source.listCategories(scope, locale).catch(() => []) : [];
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  return {
    cards: picked.rows.map((r) => toPostsFeedCard(r, { locale, categoryNames, author: input.author ?? null })),
    total: picked.total,
  };
}

// ── production source ───────────────────────────────────────────────────────

function scoped(db: SupabaseClient, table: "cms_posts" | "cms_post_categories", scope: PostScope) {
  return scope.kind === "tenant"
    ? tenantScopedQuery(db, table, scope.tenantId)
    : talentScopedQuery(db, table, scope.talentProfileId);
}

/** Owner-scoped reader. Rows are cached per (scope, locale) for the source's lifetime. */
export function createSupabasePostsWidgetSource(db: SupabaseClient): PostsWidgetSource {
  const rowsCache = new Map<string, Promise<PostsWidgetRow[]>>();
  const catCache = new Map<string, Promise<PublicPostCategoryRow[]>>();
  const key = (scope: PostScope, locale: string) =>
    `${scope.kind}:${scope.kind === "tenant" ? scope.tenantId : scope.talentProfileId}:${locale}`;
  return {
    listPublished(scope, locale) {
      const k = key(scope, locale);
      let hit = rowsCache.get(k);
      if (!hit) {
        hit = (async () => {
          const { data, error } = await scoped(db, "cms_posts", scope)
            .select(POSTS_WIDGET_COLUMNS)
            .eq("locale", locale)
            .eq("status", "published")
            .is("taken_down_at", null)
            .order("published_at", { ascending: false })
            .limit(500);
          if (error) {
            logServerError("cms/posts-widget/list", error);
            return [];
          }
          return (data ?? []) as unknown as PostsWidgetRow[];
        })();
        rowsCache.set(k, hit);
      }
      return hit;
    },
    listCategories(scope, locale) {
      const k = key(scope, locale);
      let hit = catCache.get(k);
      if (!hit) {
        hit = (async () => {
          const { data, error } = await scoped(db, "cms_post_categories", scope)
            .select("id, slug, name, locale")
            .eq("locale", locale)
            .order("name", { ascending: true });
          if (error) {
            logServerError("cms/posts-widget/categories", error);
            return [];
          }
          return (data ?? []) as PublicPostCategoryRow[];
        })();
        catCache.set(k, hit);
      }
      return hit;
    },
  };
}
