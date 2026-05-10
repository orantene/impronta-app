import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy post editor bookmark → workspace Website (posts managed there). */
export default async function LegacySiteSettingsContentPostDetailRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
