import "server-only";

import {
  scheduleWorkspaceAudit,
  type WorkspaceAuditCategory,
  type WorkspaceAuditEvent,
} from "./workspace-audit";

type AuditExtras = Partial<
  Pick<
    WorkspaceAuditEvent,
    | "targetType"
    | "targetId"
    | "targetLabel"
    | "metadata"
    | "actorUserId"
    | "actorLabel"
    | "actorKind"
  >
>;

/**
 * Positional wrapper around {@link scheduleWorkspaceAudit} for call sites in
 * files that are close to the 800-line budget: it keeps instrumentation to a
 * line or two instead of a ten-line object literal.
 *
 * Also absorbs the `tenantId` null-guard that several actions need (talent-self
 * and platform-admin paths can resolve no tenant) — a falsy tenant skips the
 * event rather than making every call site wrap itself in an `if`.
 */
export function auditEvent(
  tenantId: string | null | undefined,
  category: WorkspaceAuditCategory,
  action: string,
  summary: string,
  extra?: AuditExtras,
): void {
  if (!tenantId) return;
  scheduleWorkspaceAudit({ tenantId, category, action, summary, ...extra });
}
