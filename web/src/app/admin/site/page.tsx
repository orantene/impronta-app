import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Hub bookmark `/admin/site` → same destination as legacy `/admin/site-settings` (workspace Website). */
export default async function AdminSiteHubRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
