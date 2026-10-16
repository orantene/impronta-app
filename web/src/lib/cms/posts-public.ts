import "server-only";

/**
 * posts-public.ts — Posts v1 PUBLIC read model (TUL-1009 / TUL-1010).
 *
 * Both site families read through here:
 *   - workspace sites  → scope { kind: "tenant", tenantId }   (host tenant header)
 *   - talent sites     → scope { kind: "talent", talentProfileId } (proxy-set
 *                        talent header on a `talent_site` host)
 *
 * Reads use the SERVICE ROLE, always through `tenantScopedQuery` /
 * `talentScopedQuery` (never a raw `.from("cms_posts")`). Service role is
 * required for talent posts (there is no anon RLS policy for them, by design)
 * and for the by-slug state: the soft "unavailable" page needs to see a
 * taken-down / unpublished row that the anon policy hides.
 *
 * Every rule (listable / indexable / state) is in `posts-public-model.ts`;
 * this file only fetches. The data source is injectable so the tests run on
 * typed fakes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PostBlock } from "@/lib/cms/post-blocks";
import { createDefaultPostPriceSource, type PostPriceSource } from "@/lib/cms/post-price-source";
import {
  classifyPublicPost,
  isListablePost,
  pickPostSlugRedirect,
  PUBLIC_POST_COLUMNS,
  sortPostsNewestFirst,
  toPublicPost,
  type PostRedirectRow,
  type PublicPost,
  type PublicPostCategoryRow,
  type PublicPostRow,
  type PublicPostState,
} from "@/lib/cms/posts-public-model";
import type { PostScope } from "@/lib/cms/posts-writer";
import type { CatalogPriceRow } from "@/lib/directory/headline-price";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { talentScopedQuery } from "@/lib/supabase/talent-scoped-query";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";
import type { PostServiceMap } from "@/components/posts/PostBlocksRenderer";

export type { PostScope };

// ---- source ----------------------------------------------------------------

/** Everything the read model fetches. Each call is already owner-scoped. */
export interface PublicPostsSource {
  /** Published, not-taken-down rows for one locale (the pure filter does the rest). */
  listPublished(scope: PostScope, locale: string): Promise<PublicPostRow[]>;
  /** The row for (locale, slug) in ANY status, or null. */
  findBySlug(scope: PostScope, locale: string, slug: string): Promise<PublicPostRow | null>;
  /** Rows of a translation group (id = root OR translation_of = root). */
  listTranslationGroup(scope: PostScope, rootId: string): Promise<PublicPostRow[]>;
  findCategory(scope: PostScope, locale: string, slug: string): Promise<PublicPostCategoryRow | null>;
  getCategory(scope: PostScope, id: string): Promise<PublicPostCategoryRow | null>;
  listRedirects(scope: PostScope, oldPaths: readonly string[]): Promise<PostRedirectRow[]>;
}

function scoped(
  db: SupabaseClient,
  table: "cms_posts" | "cms_post_categories" | "cms_redirects",
  scope: PostScope,
) {
  return scope.kind === "tenant"
    ? tenantScopedQuery(db, table, scope.tenantId)
    : talentScopedQuery(db, table, scope.talentProfileId);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSupabasePublicPostsSource(db: SupabaseClient): PublicPostsSource {
  return {
    async listPublished(scope, locale) {
      const { data, error } = await scoped(db, "cms_posts", scope)
        .select(PUBLIC_POST_COLUMNS)
        .eq("locale", locale)
        .eq("status", "published")
        .is("taken_down_at", null)
        .order("published_at", { ascending: false })
        .limit(500);
      if (error) {
        logServerError("cms/posts-public/list", error);
        return [];
      }
      return (data ?? []) as unknown as PublicPostRow[];
    },
    async findBySlug(scope, locale, slug) {
      const { data, error } = await scoped(db, "cms_posts", scope)
        .select(PUBLIC_POST_COLUMNS)
        .eq("locale", locale)
        .eq("slug", slug)
        .maybeSingle();
      if (error) {
        logServerError("cms/posts-public/by-slug", error);
        return null;
      }
      return (data ?? null) as unknown as PublicPostRow | null;
    },
    async listTranslationGroup(scope, rootId) {
      if (!UUID.test(rootId)) return [];
      const { data, error } = await scoped(db, "cms_posts", scope)
        .select(PUBLIC_POST_COLUMNS)
        .or(`id.eq.${rootId},translation_of.eq.${rootId}`)
        .eq("status", "published")
        .is("taken_down_at", null);
      if (error) {
        logServerError("cms/posts-public/translations", error);
        return [];
      }
      return (data ?? []) as unknown as PublicPostRow[];
    },
    async findCategory(scope, locale, slug) {
      const { data, error } = await scoped(db, "cms_post_categories", scope)
        .select("id, slug, name, locale")
        .eq("locale", locale)
        .eq("slug", slug)
        .maybeSingle();
      if (error) logServerError("cms/posts-public/category", error);
      return (data ?? null) as PublicPostCategoryRow | null;
    },
    async getCategory(scope, id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await scoped(db, "cms_post_categories", scope)
        .select("id, slug, name, locale")
        .eq("id", id)
        .maybeSingle();
      if (error) logServerError("cms/posts-public/category-by-id", error);
      return (data ?? null) as PublicPostCategoryRow | null;
    },
    async listRedirects(scope, oldPaths) {
      if (oldPaths.length === 0) return [];
      const { data, error } = await scoped(db, "cms_redirects", scope)
        .select("old_path, new_path, status_code, active")
        .in("old_path", [...oldPaths])
        .eq("active", true);
      if (error) logServerError("cms/posts-public/redirects", error);
      return (data ?? []) as PostRedirectRow[];
    },
  };
}

export type PublicPostsDeps = { source: PublicPostsSource; now?: () => Date };

function defaultDeps(): PublicPostsDeps | null {
  const db = createServiceRoleClient();
  return db ? { source: createSupabasePublicPostsSource(db) } : null;
}

const nowOf = (deps: PublicPostsDeps) => (deps.now ? deps.now() : new Date());

// ---- reads -----------------------------------------------------------------

export type ListPublicPostsOptions = { categorySlug?: string; limit?: number };

/** Listable posts (no drafts, unlisted, expired or taken-down), newest first. */
export async function listPublicPosts(
  scope: PostScope,
  locale: string,
  opts: ListPublicPostsOptions = {},
  deps: PublicPostsDeps | null = defaultDeps(),
): Promise<PublicPost[]> {
  if (!deps) return [];
  const now = nowOf(deps);
  let categoryId: string | null = null;
  if (opts.categorySlug) {
    const cat = await deps.source.findCategory(scope, locale, opts.categorySlug);
    if (!cat) return [];
    categoryId = cat.id;
  }
  const rows = (await deps.source.listPublished(scope, locale)).filter(
    (r) => isListablePost(r, now) && (categoryId === null || r.category_id === categoryId),
  );
  const sorted = sortPostsNewestFirst(rows);
  const limited = opts.limit && opts.limit > 0 ? sorted.slice(0, opts.limit) : sorted;
  return limited.map(toPublicPost);
}

/** Raw published rows for every locale, for the sitemap + llms.txt (pure filters apply there). */
export async function listPublishedPostRows(
  scope: PostScope,
  locales: readonly string[],
  deps: PublicPostsDeps | null = defaultDeps(),
): Promise<PublicPostRow[]> {
  if (!deps) return [];
  const all = await Promise.all(locales.map((l) => deps.source.listPublished(scope, l)));
  return all.flat();
}

export async function getPublicPostBySlug(
  scope: PostScope,
  locale: string,
  slug: string,
  deps: PublicPostsDeps | null = defaultDeps(),
): Promise<PublicPostState> {
  const clean = slug.trim().toLowerCase();
  if (!deps || !clean) return { state: "not_found" };
  const row = await deps.source.findBySlug(scope, locale, clean);
  return classifyPublicPost(row, nowOf(deps));
}

/** The 301 target for a renamed slug (`/blog/<old>` → `/blog/<new>`), scoped to the owner. */
export async function resolvePostSlugRedirect(
  scope: PostScope,
  slug: string,
  deps: PublicPostsDeps | null = defaultDeps(),
): Promise<string | null> {
  const clean = slug.trim().toLowerCase();
  if (!deps || !clean) return null;
  const rows = await deps.source.listRedirects(scope, [`/blog/${clean}`, `/blog/${encodeURIComponent(clean)}`]);
  return pickPostSlugRedirect(rows, clean);
}

export async function loadPostTranslationRows(
  scope: PostScope,
  post: Pick<PublicPost, "id" | "translationOf">,
  deps: PublicPostsDeps | null = defaultDeps(),
): Promise<PublicPostRow[]> {
  if (!deps) return [];
  return deps.source.listTranslationGroup(scope, post.translationOf ?? post.id);
}

export async function loadPostCategory(
  scope: PostScope,
  where: { id: string } | { locale: string; slug: string },
  deps: PublicPostsDeps | null = defaultDeps(),
): Promise<PublicPostCategoryRow | null> {
  if (!deps) return null;
  return "id" in where
    ? deps.source.getCategory(scope, where.id)
    : deps.source.findCategory(scope, where.locale, where.slug);
}

// ---- Servicio prices ---------------------------------------------------------

type OfferingPriceRow = {
  id: string;
  title: string | null;
  amount_cents: number | null;
  currency: string | null;
  price_type: string | null;
  price_display: string | null;
  is_featured: boolean | null;
};

/**
 * Offering price loader scoped to the post's owner. Returns null (block hidden)
 * when the offering is deleted, unpublished, unapproved, hidden, belongs to
 * another owner, or is quote-only.
 */
export function createScopedOfferingLoader(db: Pick<SupabaseClient, "from">, scope: PostScope) {
  return async (offeringId: string): Promise<{ name: string | null; rows: CatalogPriceRow[] } | null> => {
    if (!UUID.test(offeringId)) return null;
    // talent_offerings is owned by a talent profile; a workspace's services are
    // the offerings carrying its tenant_id. Scope by whichever owns the post.
    const base = db
      .from("talent_offerings")
      .select("id, title, amount_cents, currency, price_type, price_display, is_featured")
      .eq("id", offeringId)
      .eq("status", "published")
      .eq("moderation_state", "approved")
      .in("visibility", ["public", "on_request"]);
    const query =
      scope.kind === "tenant" ? base.eq("tenant_id", scope.tenantId) : base.eq("talent_profile_id", scope.talentProfileId);
    const { data, error } = await query.maybeSingle();
    if (error) logServerError("cms/posts-public/offering", error);
    if (error || !data) return null;
    const row = data as OfferingPriceRow;
    const amount = row.amount_cents;
    const priced =
      row.price_display !== "quote" && row.price_type !== "custom" && typeof amount === "number" && amount > 0;
    if (!priced) return null;
    return {
      name: row.title,
      rows: [{ amountCents: amount, currency: row.currency ?? "USD", priceType: row.price_type ?? "", isFeatured: row.is_featured === true }],
    };
  };
}

export type ScopedOfferingLoader = ReturnType<typeof createScopedOfferingLoader>;

/**
 * Pre-resolve every Servicio block of a post into the renderer's map. The
 * price label goes ONLY through `createDefaultPostPriceSource` (the shared
 * price source); a missing id hides the block.
 */
export async function resolvePostServices(
  blocks: readonly PostBlock[] | null,
  locale: string,
  loader: ScopedOfferingLoader,
): Promise<PostServiceMap> {
  if (!blocks) return {};
  const ids = [...new Set(blocks.flatMap((b) => (b.type === "service" ? [b.offering_id] : [])))];
  if (ids.length === 0) return {};
  const names = new Map<string, string | null>();
  const priceSource: PostPriceSource = createDefaultPostPriceSource(async (id) => {
    const hit = await loader(id);
    if (!hit) return null;
    names.set(id, hit.name);
    return hit.rows;
  }, locale);
  const out: Record<string, { name?: string; label: string } | undefined> = {};
  await Promise.all(
    ids.map(async (id) => {
      const price = await priceSource(id).catch(() => null);
      if (!price) return;
      const name = names.get(id);
      out[id] = name ? { name, label: price.label } : { label: price.label };
    }),
  );
  return out;
}
