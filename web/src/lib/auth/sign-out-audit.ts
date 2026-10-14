/**
 * TUL-616 (option 1): the workspace audit event for a sign-out.
 *
 * The workspace is taken only from the proxy-set tenant header (an agency host);
 * the actor only from a server-verified user. With either missing there is no
 * event: we never guess which workspace a multi-workspace user signed out of.
 */
import type { WorkspaceAuditEvent } from "@/lib/audit/workspace-audit";

export function signOutAuditEvent(
  tenantId: string | null | undefined,
  user: { id: string; email: string | null | undefined } | null,
): WorkspaceAuditEvent | null {
  if (!tenantId || !user?.id) return null;
  return {
    tenantId,
    category: "auth",
    action: "auth.signed_out",
    summary: "Signed out",
    actorUserId: user.id,
    actorLabel: user.email ?? null,
  };
}
