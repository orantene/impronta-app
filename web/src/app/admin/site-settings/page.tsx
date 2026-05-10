import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy `/admin/site-settings` root bookmark → workspace Website hub. */
export default async function LegacySiteSettingsRootRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
