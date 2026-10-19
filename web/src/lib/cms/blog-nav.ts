import "server-only";

/**
 * blog-nav.ts: "does this site have a listable post in this language" for the
 * public nav (TUL-1003 / TUL-1006). ONE tiny read per (scope, locale), cached
 * for 5 minutes with `unstable_cache`, so a page view never adds a query beyond
 * the cache miss. A newly published first post therefore shows the nav link
 * within 5 minutes; a read error counts as "no posts" (never blocks the nav).
 *
 * Service role through the scope helpers (talent posts have no anon policy),
 * narrow columns, newest first, the pure rule from `posts-public-model`.
 */

import { unstable_cache } from "next/cache";

import { hasListablePost } from "@/lib/cms/blog-index-model";
import type { ListablePostFields } from "@/lib/cms/posts-public-model";
import type { PostScope } from "@/lib/cms/posts-writer";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { talentScopedQuery } from "@/lib/supabase/talent-scoped-query";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const COLUMNS = "status, published_at, is_unlisted, expires_at, taken_down_at";

async function readHasListablePost(scope: PostScope, locale: string): Promise<boolean> {
  const db = createServiceRoleClient();
  if (!db) return false;
  const query =
    scope.kind === "tenant"
      ? tenantScopedQuery(db, "cms_posts", scope.tenantId)
      : talentScopedQuery(db, "cms_posts", scope.talentProfileId);
  const { data, error } = await query
    .select(COLUMNS)
    .eq("locale", locale)
    .eq("status", "published")
    .is("taken_down_at", null)
    .order("published_at", { ascending: false })
    .limit(50);
  if (error) {
    logServerError("cms/blog-nav/has-posts", error);
    return false;
  }
  return hasListablePost((data ?? []) as unknown as ListablePostFields[], new Date());
}

export function scopeHasListablePosts(scope: PostScope, locale: string): Promise<boolean> {
  const owner = scope.kind === "tenant" ? `t:${scope.tenantId}` : `p:${scope.talentProfileId}`;
  return unstable_cache(() => readHasListablePost(scope, locale), ["cms:blog-nav:v1", owner, locale], {
    revalidate: 300,
  })();
}
