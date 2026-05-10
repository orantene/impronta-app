import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy SEO bookmark → workspace Website. */
export default async function LegacySiteSettingsSeoRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
