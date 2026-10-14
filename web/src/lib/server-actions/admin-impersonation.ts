"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dashboardPathForRole } from "@/lib/auth-flow";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/impersonation/constants";
import {
  impersonationCookieOptions,
  signImpersonationCookie,
} from "@/lib/impersonation/cookie";
import { loadProfileRowById } from "@/lib/impersonation/profile-lookup";
import {
  qaSwitchFailureReason,
  type QaSwitchReason,
  qaClientUserIdEnv,
  qaTalentUserIdEnv,
  targetRoleMatchesWorkspace,
  validateImpersonationTargetProfile,
} from "@/lib/impersonation/validate";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { requireAdmin } from "@/lib/server/action-guards";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logImpersonation } from "@/lib/platform/staff-access-log";
import { logServerError } from "@/lib/server/safe-error";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { impersonationExitPath } from "@/lib/impersonation/exit-path";
import { loadClientPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";

/**
 * `unavailable`: the switch did not start. `reason` names why (inactive, not
 * configured, wrong role, not allow-listed, no agency relationship) for the
 * super admin only; it never carries ids or profile data.
 */
export type QaImpersonationState = { error: "unavailable" | null; reason?: QaSwitchReason };

function fail(reason: QaSwitchReason): QaImpersonationState {
  return { error: "unavailable", reason };
}

function impersonationSecret(): string | undefined {
  return process.env.IMPERSONATION_COOKIE_SECRET?.trim() || undefined;
}

export async function startImpersonationAsQaTalent(
  _prev?: QaImpersonationState,
): Promise<QaImpersonationState> {
  await requireNotImpersonating();
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/login");

  const identity = await resolveDashboardIdentity();
  if (identity?.isImpersonating) {
    redirect(dashboardPathForRole(identity.subjectRole));
  }

  const secret = impersonationSecret();
  const target = qaTalentUserIdEnv();
  if (!secret || !target) {
    logServerError("admin-impersonation.startTalent", new Error("QA talent switch unavailable: secret or QA talent id not set"));
    return fail("not_configured");
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) return fail("not_configured");

  const targetProfile = await loadProfileRowById(supabase, target);
  const check = validateImpersonationTargetProfile({
    actorUserId: admin.user.id,
    actorAppRole: admin.profile?.app_role,
    targetUserId: target,
    targetProfile,
  });
  const talentReason = qaSwitchFailureReason(check, "talent", { appRole: targetProfile?.app_role });
  if (talentReason || !targetRoleMatchesWorkspace(targetProfile, "talent")) {
    logServerError("admin-impersonation.startTalent", new Error(`QA talent switch unavailable: ${talentReason ?? "wrong_role"}`));
    return fail(talentReason ?? "wrong_role");
  }

  const token = await signImpersonationCookie(secret, target);
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE_NAME, token, impersonationCookieOptions());
  await logImpersonation({ actorUserId: admin.user.id, targetUserId: target, phase: "start", targetRole: "talent" });

  revalidatePath("/", "layout");
  redirect("/talent");
}

export async function startImpersonationAsQaClient(
  _prev?: QaImpersonationState,
): Promise<QaImpersonationState> {
  await requireNotImpersonating();
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/login");

  const identity = await resolveDashboardIdentity();
  if (identity?.isImpersonating) {
    redirect(dashboardPathForRole(identity.subjectRole));
  }

  const secret = impersonationSecret();
  const target = qaClientUserIdEnv();
  if (!secret || !target) {
    logServerError("admin-impersonation.startClient", new Error("QA client switch unavailable: secret or QA client id not set"));
    return fail("not_configured");
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) return fail("not_configured");

  const targetProfile = await loadProfileRowById(supabase, target);
  const check = validateImpersonationTargetProfile({
    actorUserId: admin.user.id,
    actorAppRole: admin.profile?.app_role,
    targetProfile,
    targetUserId: target,
  });
  const clientReason = qaSwitchFailureReason(check, "client", { appRole: targetProfile?.app_role });
  if (clientReason || !targetRoleMatchesWorkspace(targetProfile, "client")) {
    logServerError("admin-impersonation.startClient", new Error(`QA client switch unavailable: ${clientReason ?? "wrong_role"}`));
    return fail(clientReason ?? "wrong_role");
  }

  // Resolve the subject's tenant shell BEFORE touching the cookie (TUL-255
  // loop). The bare /client resolver reads the actor session and misroutes
  // staff, so a client with no agency relationship is a named failure here,
  // never a fallback redirect.
  const slug = await loadClientPrimaryTenantSlug(target).catch(() => null);
  if (!slug) {
    logServerError("admin-impersonation.startClient", new Error("QA client switch unavailable: no_relationship"));
    return fail("no_relationship");
  }

  const token = await signImpersonationCookie(secret, target);
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE_NAME, token, impersonationCookieOptions());
  await logImpersonation({ actorUserId: admin.user.id, targetUserId: target, phase: "start", targetRole: "client" });

  revalidatePath("/", "layout");
  redirect(`/${slug}/client/today`);
}

export async function endImpersonationToAdmin(): Promise<void> {
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/login");

  const jar = await cookies();
  jar.delete(IMPERSONATION_COOKIE_NAME);
  await logImpersonation({ actorUserId: admin.user.id, targetUserId: null, phase: "stop" });

  revalidatePath("/", "layout");
  redirect(impersonationExitPath(admin.profile?.app_role));
}
