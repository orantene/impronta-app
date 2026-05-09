import "server-only";

import { redirect } from "next/navigation";

import { getTenantScope } from "@/lib/saas";

/**
 * Legacy platform `/admin/site-settings/{sections,structure,pages}` bookmarks.
 * Operators manage the site from **workspace admin → Website**
 * (`/{tenantSlug}/admin/website`), not the old site-settings tree.
 */
export async function redirectLegacySiteSettingsToWorkspaceWebsite(): Promise<never> {
  const scope = await getTenantScope();
  if (!scope) {
    redirect("/admin");
  }
  redirect(`/${scope.membership.slug}/admin/website`);
}
