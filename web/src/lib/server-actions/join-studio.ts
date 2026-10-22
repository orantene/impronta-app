"use server";

// TUL-75 · agency-talent path: a signed-in talent asks to join a studio from
// their own Settings. The studio's own registration policy decides (open joins
// at once, approval leaves a pending request the studio sees in Registration).
// A studio that does not take requests answers exactly like an unknown one, so
// this cannot be used to probe which workspaces exist.

import { revalidatePath } from "next/cache";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { getAppUrl } from "@/lib/auth-flow";
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { existingStudioState, parseStudioReference, type JoinStudioErrorCode } from "@/lib/onboarding/join-studio";
import { loadOwnTalentProfileId, resolveJoinableStudio } from "@/lib/onboarding/join-studio.server";
import { submitAgencyApplication } from "@/lib/talent/apply-actions";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { applyRegistrationPolicy } from "@/lib/saas/registration-policy";
import { loadRegistrationSettings, registrationIsLive } from "@/lib/saas/registration-settings";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export type JoinStudioResult =
  | { ok: true; status: "active" | "pending"; studioName: string }
  | { ok: false; code: JoinStudioErrorCode };

const REQUESTS_PER_HOUR = 10;

/** Hostnames of this environment's app and marketing origins (staging hosts on staging). */
function currentPlatformHosts(): string[] {
  const hosts: string[] = [];
  for (const origin of [getAppUrl(), resolveMarketingOrigin()]) {
    try {
      const h = new URL(origin).hostname.replace(/^www\./, "");
      if (h.includes(".")) hosts.push(h);
    } catch {
      // a malformed env value just adds no host
    }
  }
  return hosts;
}

export async function joinStudioAction(raw: string): Promise<JoinStudioResult> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, code: "read_only" };
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false, code: "signed_out" };
  const userId = session.user.id;

  const ref = parseStudioReference(typeof raw === "string" ? raw : "", currentPlatformHosts());
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
    // An approved talent is already on this studio's roster: say so instead of a generic failure.
    // Every roster status is read (not only "active"), plus approved applications, so a talent whose
    // application was approved but whose row is pending/lagging still gets a specific answer.
    const [rosterRead, approvedRead] = await Promise.all([
      tenantScopedQuery(admin, "agency_talent_roster", studio.tenantId).select("status").eq("talent_profile_id", talentProfileId),
      tenantScopedQuery(admin, "talent_agency_applications", studio.tenantId).select("id").eq("talent_profile_id", talentProfileId).eq("status", "approved").limit(1),
    ]);
    if (rosterRead.error) logServerError("join-studio.roster", rosterRead.error);
    if (approvedRead.error) logServerError("join-studio.approved", approvedRead.error);
    if (!rosterRead.error && !approvedRead.error) {
      const existing = existingStudioState(
        ((rosterRead.data ?? []) as Array<{ status: string }>).map((r) => r.status),
        (approvedRead.data ?? []).length,
      );
      if (existing) return { ok: false, code: existing };
    }
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
