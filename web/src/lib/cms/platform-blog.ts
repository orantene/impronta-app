/**
 * TUL-1399: Tulala's own product blog, on the Posts engine.
 *
 * A normal workspace (an `agencies` row) owns the posts and writes them in the
 * regular Posts writer. This module only says WHICH workspace is the product
 * blog (env PLATFORM_BLOG_TENANT_ID) and builds the site context so the same
 * public renderers serve its posts on the marketing host at tulala.digital/blog.
 * Unset = the blog is off: marketing-host /blog/* returns 404 as it did before.
 *
 * No migration and no database write: the workspace is created through the normal
 * onboarding path, and its id goes into the env var.
 */
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import type { PostSiteContext } from "@/lib/cms/posts-public-site";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PLATFORM_BLOG_LOCALES = ["en", "es"] as const;

export function platformBlogTenantId(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.PLATFORM_BLOG_TENANT_ID ?? "").trim();
  return UUID.test(v) ? v.toLowerCase() : null;
}

/** Pure: the site context for the product blog. */
export function buildPlatformBlogSite(tenantId: string): PostSiteContext {
  return {
    family: "workspace",
    scope: { kind: "tenant", tenantId },
    origin: `https://${PLATFORM_BRAND.domain}`,
    pathPrefix: "",
    defaultLocale: "en",
    supportedLocales: PLATFORM_BLOG_LOCALES,
    siteName: PLATFORM_BRAND.name,
    authorKind: "organization",
  };
}
