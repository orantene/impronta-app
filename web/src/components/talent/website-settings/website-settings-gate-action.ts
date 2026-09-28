"use server";

import { isTalentWebsiteSettingsEnabled } from "@/lib/access/talent-website-settings";
import { gate } from "@/lib/talent-site/server/site-action-gate";

/** Server-side flag check for the signed-in talent. Flag off → false. */
export async function loadWebsiteSettingsEnabledAction(): Promise<boolean> {
  const g = await gate("personalSiteEdit");
  if (!g.ok) return false;
  return isTalentWebsiteSettingsEnabled(g.talentProfileId);
}
