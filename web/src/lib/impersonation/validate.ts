import { isStaffRole } from "@/lib/auth-flow";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";

export function qaTalentUserIdEnv(): string | undefined {
  return process.env.IMPERSONATION_QA_TALENT_USER_ID?.trim() || undefined;
}

export function qaClientUserIdEnv(): string | undefined {
  return process.env.IMPERSONATION_QA_CLIENT_USER_ID?.trim() || undefined;
}

/** v1: only env-configured QA personas may be impersonated. */
export function isAllowedImpersonationTargetId(targetUserId: string): boolean {
  return (
    targetUserId === qaTalentUserIdEnv() || targetUserId === qaClientUserIdEnv()
  );
}

export function validateImpersonationTargetProfile(input: {
  actorUserId: string;
  actorAppRole: string | null | undefined;
  targetUserId: string;
  targetProfile: AccessProfileWithDisplayName | null;
}): { ok: true } | { ok: false; reason: string } {
  if (input.actorAppRole !== "super_admin") {
    return { ok: false, reason: "not_super_admin" };
  }
  if (!input.targetProfile) {
    return { ok: false, reason: "no_profile" };
  }
  if (input.targetUserId === input.actorUserId) {
    return { ok: false, reason: "self" };
  }
  if (isStaffRole(input.targetProfile.app_role)) {
    return { ok: false, reason: "staff_target" };
  }
  if (input.targetProfile.account_status !== "active") {
    return { ok: false, reason: "inactive" };
  }
  const role = input.targetProfile.app_role;
  if (role !== "talent" && role !== "client") {
    return { ok: false, reason: "role" };
  }
  if (!isAllowedImpersonationTargetId(input.targetUserId)) {
    return { ok: false, reason: "not_allowlisted" };
  }
  return { ok: true };
}

export function targetRoleMatchesWorkspace(
  targetProfile: AccessProfileWithDisplayName | null,
  workspace: "talent" | "client",
): boolean {
  return targetProfile?.app_role === workspace;
}
