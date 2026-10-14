import "server-only";

/**
 * posts-feed-sources.ts: server resolution of every `posts_feed` node on a page
 * (Posts v1, PO1). The renderer never queries; this hands it each node's cards
 * keyed by node id (two widgets on one page can filter differently).
 *
 * Scope = the RENDERING SITE, the same rule as the public `/blog` routes
 * (`posts-public-site.ts`): a talent personal site reads
 * `cms_posts.talent_profile_id`, a workspace site reads `cms_posts.tenant_id`.
 *
 * Demo examples: allowed only for a demo account (`talent_profiles.is_demo`),
 * which is what theme previews render. The builder canvas allows them through
 * the renderer's `editorPreview` flag; a real published site never shows them.
 */
import { createSupabasePostsWidgetSource, loadPostsWidgetCards, type PostsWidgetDeps } from "@/lib/cms/posts-widget-query";
import type { PostScope } from "@/lib/cms/posts-writer";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import type { NativePostsFeedNeed } from "./native-data-block-needs";
import type { PostsFeedNodeData } from "./posts-feed-model";

export type PostsFeedDataSources = {
  postsFeedByNodeId?: Record<string, PostsFeedNodeData>;
  postsFeedDemo?: boolean;
};

/** Talent site → talent scope; otherwise the workspace tenant. */
export function postsFeedScopeFor(input: { talentProfileId?: string | null; tenantId?: string | null }): PostScope | null {
  if (input.talentProfileId) return { kind: "talent", talentProfileId: input.talentProfileId };
  if (input.tenantId) return { kind: "tenant", tenantId: input.tenantId };
  return null;
}

/** PURE core (typed deps): resolve each need against one scope. */
export async function resolvePostsFeedNeeds(input: {
  needs: readonly NativePostsFeedNeed[];
  scope: PostScope;
  locale: string;
  deps: PostsWidgetDeps;
  author?: string | null;
}): Promise<Record<string, PostsFeedNodeData>> {
  const out: Record<string, PostsFeedNodeData> = {};
  await Promise.all(
    input.needs.map(async (need) => {
      try {
        out[need.nodeId] = await loadPostsWidgetCards({
          scope: input.scope,
          locale: input.locale,
          query: { ...need.query, limit: need.fetchLimit, offset: 0 },
          deps: input.deps,
          author: input.author ?? null,
        });
      } catch (error) {
        logServerError("posts-feed.resolve", error);
        out[need.nodeId] = { cards: [], total: 0 };
      }
    }),
  );
  return out;
}

export async function loadPostsFeedSources(input: {
  needs: readonly NativePostsFeedNeed[];
  talentProfileId?: string | null;
  tenantId?: string | null;
  locale: string;
}): Promise<PostsFeedDataSources> {
  if (input.needs.length === 0) return {};
  const scope = postsFeedScopeFor(input);
  const admin = createServiceRoleClient();
  if (!scope || !admin) return { postsFeedByNodeId: {} };
  try {
    let author: string | null = null;
    let demo = false;
    if (scope.kind === "talent") {
      const { data } = await admin
        .from("talent_profiles")
        .select("display_name, first_name, is_demo")
        .eq("id", scope.talentProfileId)
        .maybeSingle();
      const row = data as { display_name: string | null; first_name: string | null; is_demo: boolean | null } | null;
      author = row?.display_name?.trim() || row?.first_name?.trim() || null;
      demo = row?.is_demo === true;
    }
    const postsFeedByNodeId = await resolvePostsFeedNeeds({
      needs: input.needs,
      scope,
      locale: input.locale,
      deps: { source: createSupabasePostsWidgetSource(admin) },
      author,
    });
    return { postsFeedByNodeId, ...(demo ? { postsFeedDemo: true } : {}) };
  } catch (error) {
    logServerError("posts-feed.load", error);
    return { postsFeedByNodeId: {} };
  }
}
