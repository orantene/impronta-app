import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import { resolveMyWebsiteTarget } from "@/lib/talent-site/my-website-target";
import {
  loadOwnedBusinessWorkspace,
  type OwnedBusinessWorkspace,
} from "@/lib/talent-site/server/workspace-site-context";
import { resolveWorkspaceSitePublicUrl } from "@/lib/talent-site/workspace-site-editor-url";
import { talentSitePathUrl, talentSitePublicUrl } from "@/lib/talent-site/site-public-url";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Columns read for every managed page row (extracted from site-management-actions.ts). */
export const PAGE_COLUMNS =
  "id, slug, title, nav_label, status, is_home, sort_order, published_at, updated_at";

/** Dashboard public address: host when subdomains are on, else `/t/site/<slug>`. */
export function siteUrl(slug: string | null, isDemo = false): string | null {
  if (!slug) return null;
  if (isTalentSiteSubdomainsEnabled()) {
    const hostUrl = talentSitePublicUrl(slug, { isDemo });
    if (hostUrl) return hostUrl;
  }
  return talentSitePathUrl(slug);
}

/** TUL-347: business owners see the workspace live URL as "My website". */
/**
 * PERF-SITE: the owned-workspace lookup depends only on the user id, so the
 * manager loader starts it in the same parallel step as its site reads and
 * hands the promise to `resolveManagerPublicSiteUrl` (no serial memberships +
 * cms_pages round trips after the reads).
 */
export function startOwnedWorkspaceLoad(
  userId: string | null | undefined,
): Promise<OwnedBusinessWorkspace> | null {
  const admin = createServiceRoleClient();
  if (!admin || !userId) return null;
  return loadOwnedBusinessWorkspace(admin, userId);
}

export async function resolveManagerPublicSiteUrl(input: {
  personalSiteUrl: string | null;
  userId: string | null | undefined;
  siteExists: boolean;
  /** Pre-started via `startOwnedWorkspaceLoad`; omitted = load it here. */
  ownedPromise?: Promise<OwnedBusinessWorkspace> | null;
}): Promise<string | null> {
  if (!input.personalSiteUrl && !input.userId) return input.personalSiteUrl;
  const admin = createServiceRoleClient();
  if (!admin || !input.userId) return input.personalSiteUrl;
  const owned = await (input.ownedPromise ?? loadOwnedBusinessWorkspace(admin, input.userId));
  const target = resolveMyWebsiteTarget({
    ownsBusinessWorkspace: owned.ownsBusinessWorkspace,
    hasWorkspaceSite: owned.hasWorkspaceSite,
    workspaceSlug: owned.workspaceSlug,
    hasPersonalSite: input.siteExists,
  });
  if (target.kind !== "workspace" || !owned.tenantId) return input.personalSiteUrl;
  return resolveWorkspaceSitePublicUrl(admin, {
    tenantId: owned.tenantId,
    slug: target.slug,
  });
}
