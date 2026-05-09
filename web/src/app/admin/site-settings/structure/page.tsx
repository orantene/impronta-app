import { redirectLegacySiteSettingsToWorkspaceWebsite } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy composer URL → workspace Website (`/{slug}/admin/website`). */
export default async function LegacySiteSettingsStructureRedirect() {
  await redirectLegacySiteSettingsToWorkspaceWebsite();
}
