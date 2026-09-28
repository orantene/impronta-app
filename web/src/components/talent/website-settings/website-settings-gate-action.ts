"use server";

import { isTalentWebsiteSettingsEnabled } from "@/lib/access/talent-website-settings";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";

/**
 * Server-side flag check for the signed-in talent. Flag off → false.
 * Booking settings apply to every talent (website and Tulala profile), so this
 * checks the talent only, never a website plan capability.
 */
export async function loadWebsiteSettingsEnabledAction(): Promise<boolean> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return false;
  return isTalentWebsiteSettingsEnabled(scope.talentProfile.id);
}
