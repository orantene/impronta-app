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
import { loadClientPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";

/** `unavailable`: the QA persona id is unset, missing, or has the wrong role. */
export type QaImpersonationState = { error: "unavailable" | null };

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
    return { error: "unavailable" };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) return { error: "unavailable" };

  const targetProfile = await loadProfileRowById(supabase, target);
  const check = validateImpersonationTargetProfile({
    actorUserId: admin.user.id,
    actorAppRole: admin.profile?.app_role,
    targetUserId: target,
    targetProfile,
  });
  if (!check.ok || !targetRoleMatchesWorkspace(targetProfile, "talent")) {
    logServerError("admin-impersonation.startTalent", new Error("QA talent switch unavailable: configured id is not an active talent user"));
    return { error: "unavailable" };
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
    return { error: "unavailable" };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) return { error: "unavailable" };

  const targetProfile = await loadProfileRowById(supabase, target);
  const check = validateImpersonationTargetProfile({
    actorUserId: admin.user.id,
    actorAppRole: admin.profile?.app_role,
    targetProfile,
    targetUserId: target,
  });
  if (!check.ok || !targetRoleMatchesWorkspace(targetProfile, "client")) {
    logServerError("admin-impersonation.startClient", new Error("QA client switch unavailable: configured id is not an active client user"));
    return { error: "unavailable" };
  }

  const token = await signImpersonationCookie(secret, target);
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE_NAME, token, impersonationCookieOptions());
  await logImpersonation({ actorUserId: admin.user.id, targetUserId: target, phase: "start", targetRole: "client" });

  revalidatePath("/", "layout");
  // Prefer the subject's tenant shell so we never depend on the bare /client
  // resolver (TUL-255 loop). Fall back to /client when the subject has no
  // primary agency relationship yet.
  const slug = await loadClientPrimaryTenantSlug(target).catch(() => null);
  redirect(slug ? `/${slug}/client/today` : "/client");
}

export async function endImpersonationToAdmin(): Promise<void> {
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/login");

  const jar = await cookies();
  jar.delete(IMPERSONATION_COOKIE_NAME);
  await logImpersonation({ actorUserId: admin.user.id, targetUserId: null, phase: "stop" });

  revalidatePath("/", "layout");
  redirect("/admin");
}
