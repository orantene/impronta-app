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
import { loadDiscoverTalents } from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";
import {
  DIRECTORY_PAGE_SIZE,
  type DirectoryCardRow,
  type DirectoryQuery,
} from "@/components/marketing/directory/shared";
import { resolveCardDesign } from "@/lib/site-admin/server/card-design-resolver";
import { DEFAULT_CARD_DESIGN } from "@/lib/site-admin/server/card-design-shape";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";

export async function loadMoreDirectoryTalents(
  query: DirectoryQuery,
  offset: number,
): Promise<{ items: DirectoryCardRow[]; total: number }> {
  const page = await loadDiscoverTalents({
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

  // Same UNIFORM hub-tenant design as the SSR first page (see
  // global-directory/page.tsx). Without this, rows past the first page would
  // render in the platform-default palette while rows above the fold carry the
  // hub palette — a visible inconsistency the moment a visitor clicks
  // "Show more".
  const hub = await getPlatformHubTenant();
  const design = hub
    ? await resolveCardDesign(hub.tenantId)
    : DEFAULT_CARD_DESIGN;
  return {
    items: page.items.map((row) => ({ ...row, design })),
    total: page.total,
  };
}
