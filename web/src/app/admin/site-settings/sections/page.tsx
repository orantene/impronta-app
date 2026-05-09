import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy bookmark → workspace Website (`/{slug}/admin/website`). */
export default async function LegacySiteSettingsSectionsRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
