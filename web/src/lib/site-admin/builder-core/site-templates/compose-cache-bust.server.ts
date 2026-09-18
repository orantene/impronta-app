import "server-only";

import { updateTag } from "next/cache";

import { tagFor, tenantBustTags } from "@/lib/site-admin/cache-tags";

/**
 * Cache busts a compose owes the public site. Each one is a no-op outside a
 * request scope (scripts, tests): there is nothing to bust there.
 */

/** The public theme is served from the `branding` cache tag (reads.ts); a new Look must reach the page now, not after a restart. */
export function bustBrandingCache(tenantId: string): void {
  try {
    updateTag(tagFor(tenantId, "branding"));
  } catch {
    /* outside a request scope (scripts, tests): nothing to bust */
  }
}
export function bustIdentityCache(tenantId: string): void {
  try {
    updateTag(tagFor(tenantId, "identity"));
  } catch {
    /* outside a request scope */
  }
}
/**
 * A compose rewrites the homepage, the shell, the pages, the theme and the
 * name: every public cache surface of the tenant is stale afterwards. The
 * page writers bust their own tags; this is the belt for the ones that
 * render one compose behind (seen live: previous hero under the new name).
 */
export function bustAllTenantCaches(tenantId: string): void {
  try {
    for (const tag of tenantBustTags(tenantId)) updateTag(tag);
  } catch {
    /* outside a request scope */
  }
}

