import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy content-navigation bookmark → workspace Website. */
export default async function LegacySiteSettingsContentNavigationRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
