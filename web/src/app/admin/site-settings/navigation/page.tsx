import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy navigation bookmark → workspace Website. */
export default async function LegacySiteSettingsNavigationRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
