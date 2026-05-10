import { redirectLegacySiteSettingsToWorkspaceSettings } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy branding bookmark → workspace Settings. */
export default async function LegacySiteSettingsBrandingRedirect() {
  await redirectLegacySiteSettingsToWorkspaceSettings();
}
