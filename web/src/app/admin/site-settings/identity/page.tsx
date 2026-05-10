import { redirectLegacySiteSettingsToWorkspaceSettings } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy identity bookmark → workspace Settings (`/{slug}/admin/settings`). */
export default async function LegacySiteSettingsIdentityRedirect() {
  await redirectLegacySiteSettingsToWorkspaceSettings();
}
