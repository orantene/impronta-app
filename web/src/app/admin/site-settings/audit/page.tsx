import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy audit bookmark → workspace Website hub (closest consolidated surface). */
export default async function LegacySiteSettingsAuditRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
