import "server-only";

import { buildPlatformBlogSite, platformBlogTenantId } from "@/lib/cms/platform-blog";
import { resolveWorkspacePostSite, type PostSiteContext } from "@/lib/cms/posts-public-site";
import { getPublicHostContext } from "@/lib/saas/scope";

/** TUL-1399: the product blog, only on a marketing host and only when configured. */
export async function resolvePlatformBlogSite(): Promise<PostSiteContext | null> {
  const tenantId = platformBlogTenantId();
  if (!tenantId) return null;
  const ctx = await getPublicHostContext();
  return ctx.kind === "marketing" ? buildPlatformBlogSite(tenantId) : null;
}

/** A workspace host serves its own posts; the marketing host serves the product blog. */
export async function resolveBlogSite(): Promise<PostSiteContext | null> {
  return (await resolveWorkspacePostSite()) ?? (await resolvePlatformBlogSite());
}
