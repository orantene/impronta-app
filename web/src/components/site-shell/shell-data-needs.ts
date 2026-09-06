import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectBuilderCollectionSourceKeys,
  collectBuilderImageMediaIds,
  collectSocialFeedProviders,
  type BuilderNode,
  type SocialFeedProviderKey,
} from "@/lib/site-admin/builder-node";
import { collectNavCollectionSourceKeys } from "@/lib/site-admin/server/nav-collection-sources";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type ShellDataNeeds = {
  mediaIds: string[];
  collectionSourceKeys: string[];
  /**
   * A4 follow-up: built-in collection NAV sources (cms_page / cms_posts) a nav
   * node in this slot binds to. Resolved + injected into the same
   * `collections` map so the nav render case auto-populates its links.
   */
  navCollectionSourceKeys: string[];
  /**
   * Phase 3: connected `social_feed` blocks read the cron-filled cache; the
   * render path never fetches a vendor. Resolved over the same node set.
   */
  socialFeedProviders: SocialFeedProviderKey[];
  /** Null when the node set needs no privileged read at all. */
  serviceSupabase: SupabaseClient | null;
  mediaSupabase: SupabaseClient | null;
};

/**
 * Everything a shell slot (curated or freeform) needs to fetch before it can
 * render, computed once over exactly the nodes that will be painted. Both
 * shell render paths used to compute this block by hand, identically; one
 * place now decides whether a service-role client is warranted.
 */
export function collectShellDataNeeds(
  nodes: ReadonlyArray<BuilderNode>,
): ShellDataNeeds {
  const mediaIds = collectBuilderImageMediaIds(nodes);
  const collectionSourceKeys = collectBuilderCollectionSourceKeys(nodes);
  const navCollectionSourceKeys = collectNavCollectionSourceKeys(nodes);
  const socialFeedProviders = collectSocialFeedProviders(nodes);
  const serviceSupabase =
    mediaIds.length > 0 ||
    collectionSourceKeys.length > 0 ||
    navCollectionSourceKeys.length > 0 ||
    socialFeedProviders.length > 0
      ? createServiceRoleClient()
      : null;
  return {
    mediaIds,
    collectionSourceKeys,
    navCollectionSourceKeys,
    socialFeedProviders,
    serviceSupabase,
    mediaSupabase: mediaIds.length > 0 ? serviceSupabase : null,
  };
}
