import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy pages hub → workspace Website (`/{slug}/admin/website`). */
export default async function LegacySiteSettingsPagesRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
