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
import { createClient } from "@/lib/supabase/server";

function impersonationSecret(): string | undefined {
  return process.env.IMPERSONATION_COOKIE_SECRET?.trim() || undefined;
}

export async function startImpersonationAsQaTalent(): Promise<void> {
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

  const supabase = await createClient();
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

  revalidatePath("/", "layout");
  redirect("/talent");
}

export async function startImpersonationAsQaClient(): Promise<void> {
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

  const supabase = await createClient();
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

  revalidatePath("/", "layout");
  redirect("/client");
}

export async function endImpersonationToAdmin(): Promise<void> {
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/login");

  const jar = await cookies();
  jar.delete(IMPERSONATION_COOKIE_NAME);

  revalidatePath("/", "layout");
  redirect("/admin");
}
