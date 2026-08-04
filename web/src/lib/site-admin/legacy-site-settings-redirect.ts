import "server-only";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/server/action-guards";
import { getTenantScope } from "@/lib/saas";

/**
 * Legacy platform `/admin/site-settings/*` bookmarks (structure, pages, seo,
 * content hub, audit, …). Operators manage the site from **workspace admin →
 * Website** (`/{tenantSlug}/admin/website`) or **Settings**, not the old tree.
 */
export async function redirectLegacySiteSettingsToWorkspaceWebsite(): Promise<never> {
  const scope = await getTenantScope();
  if (!scope) {
    redirect("/admin");
  }
  redirect(`/${scope.membership.slug}/admin/website`);
}

/**
 * Legacy `/admin/site-settings/identity` (and similar) bookmarks → workspace **Settings**
 * (`/{tenantSlug}/admin/settings`). Agency identity / branding controls live in the prototype
 * settings shell, not under `site-settings`.
 */
export async function redirectLegacySiteSettingsToWorkspaceSettings(): Promise<never> {
  const scope = await getTenantScope();
  if (!scope) {
    redirect("/admin");
  }
  redirect(`/${scope.membership.slug}/admin/settings`);
}

/**
 * Legacy `/admin/site-settings/pages/<cms_pages.id>` deep links (page picker duplicate,
 * bookmarks). Resolves the row and sends staff to the **in-place storefront builder**
 * for that page — same destination shape as the builder page picker (`slug → /${slug}?edit=1`).
 *
 * Unknown ids or lookup failures fall back to workspace **Website** so operators never
 * land on a dead route.
 */
export async function redirectLegacySiteSettingsPageIdToStorefrontEditor(
  pageId: string,
): Promise<never> {
  const auth = await requireSession();
  if (!auth.ok) {
    redirect("/login");
  }

  const scope = await getTenantScope();
  if (!scope) {
    redirect("/admin");
  }

  const { data, error } = await auth.supabase
    .from("cms_pages")
    .select("slug, system_template_key")
    .eq("id", pageId)
    .eq("tenant_id", scope.tenantId)
    .neq("status", "archived")
    .maybeSingle<{
      slug: string | null;
      system_template_key: string | null;
    }>();

  const fallbackWorkspace = `/${scope.membership.slug}/admin/website`;
  if (error || !data) {
    redirect(fallbackWorkspace);
  }

  if (data.system_template_key === "homepage") {
    redirect("/?edit=1");
  }

  const slug = data.slug?.trim() ?? "";
  if (!slug) {
    redirect(fallbackWorkspace);
  }

  redirect(`/${slug}?edit=1`);
}
