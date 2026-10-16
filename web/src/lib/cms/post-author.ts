import "server-only";

/**
 * post-author.ts — the "Autor" widget data (Posts v1, TUL-1008): name, avatar
 * and short bio of the person who wrote the post.
 *
 *   workspace post → `profiles` row named by `cms_posts.author_profile_id`
 *                    (name + avatar; profiles carry no bio)
 *   talent post    → the talent's own profile: display name + short bio
 *                    (avatar from the author profile row when set)
 *
 * Reads are owner-scoped (the post is looked up inside the site's scope) and
 * the source is injectable for tests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PostScope } from "@/lib/cms/posts-writer";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { talentScopedQuery } from "@/lib/supabase/talent-scoped-query";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export type PostAuthor = { name: string; avatarUrl: string | null; bio: string | null };

export interface PostAuthorSource {
  /** `author_profile_id` of one post inside the scope, or null. */
  authorProfileIdOfPost(scope: PostScope, postId: string): Promise<string | null>;
  profile(profileId: string): Promise<{ displayName: string | null; avatarUrl: string | null } | null>;
  talent(talentProfileId: string): Promise<{ displayName: string | null; shortBio: string | null } | null>;
}

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Null when nothing presentable is known (the widget then renders nothing). */
export async function loadPostAuthor(
  source: PostAuthorSource,
  scope: PostScope,
  postId: string | null,
): Promise<PostAuthor | null> {
  const profileId = postId ? await source.authorProfileIdOfPost(scope, postId) : null;
  const [profile, talent] = await Promise.all([
    profileId ? source.profile(profileId) : null,
    scope.kind === "talent" ? source.talent(scope.talentProfileId) : null,
  ]);
  const name = clean(talent?.displayName) ?? clean(profile?.displayName);
  if (!name) return null;
  return { name, avatarUrl: clean(profile?.avatarUrl), bio: clean(talent?.shortBio) };
}

export function createSupabasePostAuthorSource(db: SupabaseClient): PostAuthorSource {
  return {
    async authorProfileIdOfPost(scope, postId) {
      const q =
        scope.kind === "tenant"
          ? tenantScopedQuery(db, "cms_posts", scope.tenantId)
          : talentScopedQuery(db, "cms_posts", scope.talentProfileId);
      const { data, error } = await q.select("author_profile_id").eq("id", postId).maybeSingle();
      if (error) {
        logServerError("cms/post-author/post", error);
        return null;
      }
      return (data as { author_profile_id?: string | null } | null)?.author_profile_id ?? null;
    },
    async profile(profileId) {
      const { data, error } = await db.from("profiles").select("display_name, avatar_url").eq("id", profileId).maybeSingle();
      if (error) logServerError("cms/post-author/profile", error);
      const row = data as { display_name: string | null; avatar_url: string | null } | null;
      return row ? { displayName: row.display_name, avatarUrl: row.avatar_url } : null;
    },
    async talent(talentProfileId) {
      const { data, error } = await db
        .from("talent_profiles")
        .select("display_name, short_bio")
        .eq("id", talentProfileId)
        .maybeSingle();
      if (error) logServerError("cms/post-author/talent", error);
      const row = data as { display_name: string | null; short_bio: string | null } | null;
      return row ? { displayName: row.display_name, shortBio: row.short_bio } : null;
    },
  };
}

export function defaultPostAuthorSource(): PostAuthorSource | null {
  const db = createServiceRoleClient();
  return db ? createSupabasePostAuthorSource(db) : null;
}
