"use server";

/**
 * Maison Choose-a-design bootstrap. Flag-off → `{ enabled: false }` so the
 * host renders nothing and TalentMaxSiteManager keeps today's gallery path.
 */
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { gate } from "@/lib/talent-site/server/site-action-gate";

export type MaisonSetupBootstrap =
  | { enabled: false }
  | { enabled: true; talentProfileId: string };

export async function loadMaisonSetupBootstrapAction(): Promise<MaisonSetupBootstrap> {
  if (!isTalentMaisonThemeEnabled()) return { enabled: false };
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { enabled: false };
  return { enabled: true, talentProfileId: g.talentProfileId };
}
