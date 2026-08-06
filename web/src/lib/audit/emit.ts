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

/**
 * Record something that FAILED or was REFUSED.
 *
 * Deliberately NOT a mirror of `logServerError` — there are hundreds of those
 * and most carry no workspace context, so piping them all in would flood the
 * log (and the retention cap) with noise support can't act on. This is for
 * failures a workspace admin or Tulala support would actually ask about:
 * a refused permission, an upload that did not land, a payment that failed.
 *
 * Ordinary crashes stay in Sentry (`logServerError`); the two systems answer
 * different questions.
 *
 * By convention the action ends in `.denied` or `.failed` so the table can
 * flag the row — see `isFailureAction` in the activity-log filter module.
 * Keep `reason` short and free of secrets; it is shown to workspace admins.
 */
export function auditFailure(
  tenantId: string | null | undefined,
  category: WorkspaceAuditCategory,
  action: string,
  summary: string,
  extra?: AuditExtras & { reason?: string },
): void {
  if (!tenantId) return;
  const { reason, ...rest } = extra ?? {};
  scheduleWorkspaceAudit({
    tenantId,
    category,
    action,
    summary,
    ...rest,
    metadata: { ...(rest.metadata ?? {}), ...(reason ? { reason } : {}) },
  });
}
