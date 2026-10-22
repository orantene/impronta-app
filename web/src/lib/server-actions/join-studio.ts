"use server";

// TUL-75 · agency-talent path: a signed-in talent asks to join a studio from
// their own Settings. The studio's own registration policy decides (open joins
// at once, approval leaves a pending request the studio sees in Registration).
// A studio that does not take requests answers exactly like an unknown one, so
// this cannot be used to probe which workspaces exist.

import { revalidatePath } from "next/cache";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { parseStudioReference, type JoinStudioErrorCode } from "@/lib/onboarding/join-studio";
import { loadOwnTalentProfileId, resolveJoinableStudio } from "@/lib/onboarding/join-studio.server";
import { submitAgencyApplication } from "@/lib/talent/apply-actions";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { applyRegistrationPolicy } from "@/lib/saas/registration-policy";
import { loadRegistrationSettings, registrationIsLive } from "@/lib/saas/registration-settings";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type JoinStudioResult =
  | { ok: true; status: "active" | "pending"; studioName: string }
  | { ok: false; code: JoinStudioErrorCode };

const REQUESTS_PER_HOUR = 10;

export async function joinStudioAction(raw: string): Promise<JoinStudioResult> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, code: "read_only" };
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false, code: "signed_out" };
  const userId = session.user.id;

  const ref = parseStudioReference(typeof raw === "string" ? raw : "");
  if (!ref) return { ok: false, code: "bad_address" };
  if (!tryConsumeRateLimit(`join-studio:${userId}`, REQUESTS_PER_HOUR, 60 * 60 * 1000)) {
    return { ok: false, code: "too_many" };
  }

  try {
    const talentProfileId = await loadOwnTalentProfileId(admin, userId);
    if (talentProfileId === "error") return { ok: false, code: "failed" };
    if (!talentProfileId) return { ok: false, code: "no_profile" };

    const studio = await resolveJoinableStudio(admin, ref);
    if (!studio) return { ok: false, code: "not_found" };
    const settings = await loadRegistrationSettings(studio.tenantId);
    if (!registrationIsLive(settings)) {
      // TUL-1862: a studio that is not self-registering can still take applications
      // (the open-applications switch Discover Agencies lists). That path files a
      // pending application the studio decides; anything else stays "not found".
      if (!studio.acceptsOpenApplications) return { ok: false, code: "not_found" };
      const applied = await submitAgencyApplication(studio.tenantId);
      if (applied.ok) return { ok: true, status: "pending", studioName: studio.displayName };
      if (applied.code === "duplicate_pending") return { ok: false, code: "already_pending" };
      if (applied.code === "exclusivity_block") return { ok: false, code: "exclusive" };
      if (applied.code === "talent_profile_not_found") return { ok: false, code: "no_profile" };
      return { ok: false, code: "failed" };
    }

    const outcome = await applyRegistrationPolicy(admin, {
      tenantId: studio.tenantId,
      talentProfileId,
      userId,
      originDomain: null,
    });
    if (!outcome.ok) return { ok: false, code: "failed" };

    revalidatePath("/talent", "layout");
    return { ok: true, status: outcome.status, studioName: studio.displayName };
  } catch (err) {
    logServerError("join-studio.run", err);
    return { ok: false, code: "failed" };
  }
}
