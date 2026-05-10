import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy “new page” bookmark → workspace Website (create flows live there). */
export default async function LegacySiteSettingsPagesNewRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
