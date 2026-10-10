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
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { loadClientPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";

function impersonationSecret(): string | undefined {
  return process.env.IMPERSONATION_COOKIE_SECRET?.trim() || undefined;
}

export async function startImpersonationAsQaTalent(): Promise<void> {
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
    throw new Error("Impersonation is not configured (secret or QA talent id).");
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) throw new Error("Not configured.");

  const targetProfile = await loadProfileRowById(supabase, target);
  const check = validateImpersonationTargetProfile({
    actorUserId: admin.user.id,
    actorAppRole: admin.profile?.app_role,
    targetUserId: target,
    targetProfile,
  });
  if (!check.ok || !targetRoleMatchesWorkspace(targetProfile, "talent")) {
    throw new Error("Invalid QA talent user for impersonation.");
  }

  const token = await signImpersonationCookie(secret, target);
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE_NAME, token, impersonationCookieOptions());
  await logImpersonation({ actorUserId: admin.user.id, targetUserId: target, phase: "start", targetRole: "talent" });

  revalidatePath("/", "layout");
  redirect("/talent");
}

export async function startImpersonationAsQaClient(): Promise<void> {
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
    throw new Error("Impersonation is not configured (secret or QA client id).");
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) throw new Error("Not configured.");

  const targetProfile = await loadProfileRowById(supabase, target);
  const check = validateImpersonationTargetProfile({
    actorUserId: admin.user.id,
    actorAppRole: admin.profile?.app_role,
    targetProfile,
    targetUserId: target,
  });
  if (!check.ok || !targetRoleMatchesWorkspace(targetProfile, "client")) {
    throw new Error("Invalid QA client user for impersonation.");
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
