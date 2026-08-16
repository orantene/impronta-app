/**
 * Shared owner+Max gate for the Talent Max Site server actions.
 *
 * Extracted from `site-management-actions.ts` so the logo lane
 * (`site-logo-actions.ts`) can reuse the exact same check rather than
 * duplicating it — that file is a `"use server"` module and every export
 * there becomes a callable server action, so the gate cannot live in it.
 *
 * Plain module on purpose (no `"use server"`, no `server-only`): the
 * marker breaks the tsx test lanes that lack the polyfill.
 */

import {
  requireTalentSelf,
  assertTalentCanUseCustomBuilder,
} from "@/lib/server/talent-self-guard";
import type { MaxSiteActionResult } from "./site-management-types";

export type GateOk = {
  ok: true;
  talentProfileId: string;
  displayName: string;
  profileCode: string | null;
  userId: string;
  planKey: string;
};
export type GateFail = Extract<MaxSiteActionResult, { ok: false }>;

/**
 * Resolve the signed-in talent + assert Max. Every management action funnels
 * through this so the owner + Max checks live in one place. Lower tiers get
 * `plan_required` (the dashboard shows an upsell).
 */
export async function gate(): Promise<GateOk | GateFail> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanUseCustomBuilder(scope.planKey)) {
    return {
      ok: false,
      code: "plan_required",
      error: "Upgrade to Max to build and manage your website.",
    };
  }
  return {
    ok: true,
    talentProfileId: scope.talentProfile.id,
    displayName: scope.talentProfile.displayName,
    profileCode: scope.talentProfile.profileCode,
    userId: scope.session.user.id,
    planKey: scope.planKey,
  };
}
