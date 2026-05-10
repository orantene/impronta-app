import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy content pages list bookmark → workspace Website. */
export default async function LegacySiteSettingsContentPagesRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
