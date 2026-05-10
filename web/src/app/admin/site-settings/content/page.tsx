import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy content hub bookmark → workspace Website. */
export default async function LegacySiteSettingsContentRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
