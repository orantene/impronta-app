import "server-only";

/**
 * blog-cms-page.ts: does this workspace own a CMS page slugged "blog"?
 *
 * Before the post index existed, a bare `/blog` on a workspace host was a
 * clean-URL CMS slug (`/p/blog`). The index route keeps that page working: when
 * the workspace has one (in ANY language, as the CMS page route falls back
 * across locales), the CMS page is served; otherwise the post index is.
 */

import type { Locale } from "@/i18n/config";
import type { PostScope } from "@/lib/cms/posts-writer";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadPageForRender } from "@/lib/site-admin/server/page-reads";
import { loadMaxSitePages } from "@/lib/talent-site/server/load-max-site";

export async function workspaceHasCmsBlogPage(scope: PostScope, locale: string): Promise<boolean> {
  if (scope.kind !== "tenant") return false;
  const section = await loadPageForRender(scope.tenantId, locale as Locale, "blog").catch(() => null);
  if (section?.snapshot) return true;
  const supabase = await getCachedServerSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: scope.tenantId })
    .select("slug")
    .eq("slug", "blog")
    .limit(1);
  if (error) {
    logServerError("cms/blog-cms-page", error);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Talent twin: a published personal-site page slugged "blog" keeps its URL (the index yields to it). */
export async function talentHasBlogPage(talentProfileId: string): Promise<boolean> {
  const pages = await loadMaxSitePages(talentProfileId).catch(() => []);
  return pages.some((p) => p.slug === "blog" && p.status === "published");
}
