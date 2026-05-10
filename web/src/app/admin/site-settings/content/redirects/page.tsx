import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy redirects bookmark → workspace Website. */
export default async function LegacySiteSettingsContentRedirectsRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
