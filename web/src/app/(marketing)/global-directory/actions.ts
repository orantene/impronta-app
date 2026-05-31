"use server";

/**
 * Public Global Talent Directory — incremental "load more" path.
 *
 * The buyer-side REST route `/api/discover/talents` is auth-gated (401 for
 * anonymous visitors) and `/api/*` is 404 on the marketing host anyway, so
 * pagination here goes through a Server Action that calls the cross-tenant
 * discover bridge directly. No new `/api/*` surface, no auth gate — works
 * for anonymous marketing visitors.
 *
 * Reads ONLY the discoverable set the materialized view exposes (is_discoverable
 * + approved/published). It never widens that set or tenant-scopes it.
 */
import {
  loadDiscoverTalents,
  type DiscoverTalentListItem,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";
import { DIRECTORY_PAGE_SIZE, type DirectoryQuery } from "@/components/marketing/directory/shared";

export async function loadMoreDirectoryTalents(
  query: DirectoryQuery,
  offset: number,
): Promise<{ items: DiscoverTalentListItem[]; total: number }> {
  return loadDiscoverTalents({
    q: query.q ?? undefined,
    country: query.country ?? undefined,
    city: query.city ?? undefined,
    category: query.category ?? undefined,
    trustTier: query.trustTier ?? undefined,
    availableOnly: query.availableOnly || undefined,
    sort: query.sort,
    limit: DIRECTORY_PAGE_SIZE,
    offset: Math.max(offset, 0),
  });
}
