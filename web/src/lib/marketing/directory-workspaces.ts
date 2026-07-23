import "server-only";

import { workspacePathUrl } from "@/lib/saas/workspace-public-url";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Real, publicly listable workspaces for the /discover-agencies hub.
 *
 * Why this exists: `/w` (the public parent for path-based workspaces) 301s
 * here, so this page is the crawl hub for every workspace URL. It used to
 * render a hard-coded editorial array that linked to ZERO workspaces, which
 * left every `/w/<slug>` page orphaned — no internal link, sitemap only.
 *
 * Listing is STRICT OPT-IN (`agencies.settings.directory_listed === true`)
 * rather than "every active tenant", because this table also holds QA and
 * internal workspaces that must never appear on a public page. Nothing is
 * listed until a workspace explicitly opts in, so the default is safe.
 *
 * We additionally require at least one published CMS page: opting in is not
 * enough if there is nothing live to link to.
 */
export type DirectoryWorkspace = {
  id: string;
  slug: string;
  name: string;
  /** Canonical public URL — tulala.digital/w/<slug>. */
  href: string;
  planTier: string | null;
};

export async function loadDirectoryWorkspaces(): Promise<DirectoryWorkspace[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("agencies")
    .select("id, slug, display_name, plan_tier, settings")
    .eq("status", "active")
    .eq("kind", "agency");

  if (error) {
    logServerError("marketing/loadDirectoryWorkspaces", error);
    return [];
  }

  type Row = {
    id: string;
    slug: string | null;
    display_name: string | null;
    plan_tier: string | null;
    settings: Record<string, unknown> | null;
  };

  const optedIn = (data ?? [])
    .filter((row): row is Row => Boolean(row))
    .filter((row) => {
      const settings = row.settings;
      if (!settings || typeof settings !== "object") return false;
      return settings["directory_listed"] === true;
    })
    .filter((row) => Boolean(row.slug));

  if (optedIn.length === 0) return [];

  // Require something actually published to link to.
  const { data: publishedRows, error: publishedError } = await admin
    .from("cms_pages")
    .select("tenant_id")
    .eq("status", "published")
    .in(
      "tenant_id",
      optedIn.map((row) => row.id),
    );

  if (publishedError) {
    logServerError("marketing/loadDirectoryWorkspaces.published", publishedError);
    return [];
  }

  const hasPublished = new Set(
    (publishedRows ?? []).map((row) => String((row as { tenant_id: string }).tenant_id)),
  );

  return optedIn
    .filter((row) => hasPublished.has(row.id))
    .map((row) => {
      const slug = String(row.slug);
      return {
        id: row.id,
        slug,
        name: row.display_name?.trim() || slug,
        href: workspacePathUrl(slug),
        planTier: row.plan_tier,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
