import { redirectLegacySiteSettingsToWorkspaceSettings } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy system bookmark → workspace Settings. */
export default async function LegacySiteSettingsSystemRedirect() {
  await redirectLegacySiteSettingsToWorkspaceSettings();
}
