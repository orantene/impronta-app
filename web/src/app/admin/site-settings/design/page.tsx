import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy design/theme bookmark → workspace Website (site management entry). */
export default async function LegacySiteSettingsDesignRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
