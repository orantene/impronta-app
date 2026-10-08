import "server-only";

import { logPlatformAdminAction } from "@/lib/platform/audit";

/**
 * Staff access log (legal 3.5).
 *
 * Platform staff can read customers' inquiries and messages they are not a
 * party to. Each such read leaves a `platform_audit_log` row, so "who looked at
 * my conversation" is answerable. Same for starting and stopping impersonation.
 *
 * `platform_audit_log.target_kind` has a CHECK constraint (no migration here),
 * so these use the existing kinds: the workspace for inquiry reads, the
 * impersonated profile for impersonation. The inquiry id rides in context.
 *
 * Action strings are new and stable; do not rename them, queries key on them.
 */
export const STAFF_ACCESS_ACTIONS = {
  inquiryRead: "staff.inquiry_thread.read",
  impersonationStart: "staff.impersonation.start",
  impersonationStop: "staff.impersonation.stop",
} as const;

type ParticipantLookup = (inquiryId: string, userId: string) => Promise<boolean>;

/**
 * Log when a platform admin reads an inquiry thread. A participant reading their
 * own thread is not staff access and is not logged. Never throws: the audit
 * writer swallows its own errors and the lookup is guarded here, because a
 * failed log must not block the page. On lookup failure it logs (fail toward
 * recording).
 */
export async function logStaffInquiryRead(params: {
  actorUserId: string;
  actorAppRole: string | null | undefined;
  tenantId: string;
  inquiryId: string;
  surface: string;
  isParticipant: ParticipantLookup;
}): Promise<boolean> {
  if (params.actorAppRole !== "super_admin") return false;
  let participant = false;
  try {
    participant = await params.isParticipant(params.inquiryId, params.actorUserId);
  } catch {
    participant = false;
  }
  if (participant) return false;
  await logPlatformAdminAction({
    actorUserId: params.actorUserId,
    targetKind: "workspace",
    targetId: params.tenantId,
    action: STAFF_ACCESS_ACTIONS.inquiryRead,
    supportMode: "read_only",
    context: { inquiryId: params.inquiryId, surface: params.surface },
  });
  return true;
}

export async function logImpersonation(params: {
  actorUserId: string;
  targetUserId: string | null;
  phase: "start" | "stop";
  targetRole?: "talent" | "client";
}): Promise<void> {
  if (!params.targetUserId && params.phase === "start") return;
  await logPlatformAdminAction({
    actorUserId: params.actorUserId,
    targetKind: "profile",
    // On stop the cookie is cleared without re-reading the subject; the actor's
    // own id is the target so the row still exists and is attributable.
    targetId: params.targetUserId ?? params.actorUserId,
    action:
      params.phase === "start"
        ? STAFF_ACCESS_ACTIONS.impersonationStart
        : STAFF_ACCESS_ACTIONS.impersonationStop,
    context: { targetRole: params.targetRole ?? null },
  });
}
