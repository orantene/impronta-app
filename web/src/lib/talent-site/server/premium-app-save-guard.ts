/**
 * Premium-app install gate for talent draft-save chokepoints.
 *
 * Unlike `loadTalentSiteSaveCapabilities`, this does NOT short-circuit when
 * `TALENT_FREE_WEBSITE_ENABLED` is off. A talent owner is always plan-checked
 * (fail closed). Returns `null` only when the actor is not the owning talent
 * (workspace staff edits) — staff may still write; a talent cannot bypass via
 * the free-website flag.
 *
 * Plain module (no `"use server"` / `server-only`) so tsx lanes can import it.
 */

import {
  assertPremiumAppTreeMutation,
  canAddLibraryApp,
} from "@/lib/site-admin/add-gallery/app-plan-gate";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";

export type TalentPremiumAppSaveGate = {
  canUsePremiumApps: boolean;
};

/**
 * The owning talent's premium-app capability, or `null` when this save is not
 * a talent-owner write (staff / not signed in as the row's talent).
 */
export async function loadTalentPremiumAppSaveGate(
  talentProfileId: string | null | undefined,
): Promise<TalentPremiumAppSaveGate | null> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  if (talentProfileId && talentProfileId !== scope.talentProfile.id) return null;
  // Fail closed: null / unknown plan → cannot add premium apps.
  return { canUsePremiumApps: canAddLibraryApp(scope.planKey) };
}

/**
 * Run the premium-app insert check for a talent-owner save. Returns an error
 * message to refuse the write, or `null` when the save may proceed (staff
 * path, or plan allows, or no new premium node).
 */
export async function refuseTalentPremiumAppTreeMutation(input: {
  talentProfileId: string | null | undefined;
  previousTree: unknown;
  nextTree: unknown;
  locale?: string | null;
}): Promise<string | null> {
  const gate = await loadTalentPremiumAppSaveGate(input.talentProfileId);
  if (!gate) return null;
  const verdict = assertPremiumAppTreeMutation({
    previousTree: input.previousTree,
    nextTree: input.nextTree,
    canUsePremiumApps: gate.canUsePremiumApps,
    locale: input.locale,
  });
  return verdict.ok ? null : verdict.message;
}
