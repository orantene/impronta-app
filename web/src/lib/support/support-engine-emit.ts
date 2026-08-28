import "server-only";

import { after } from "next/server";

import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { logPlatformAdminAction } from "@/lib/platform/audit";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

export function notify(event: {
  type: string;
  tenantId: string | null;
  eventId: string;
  userId?: string | null;
  payload: Record<string, unknown>;
}): void {
  // Defer past the response flush with after() so a frozen serverless
  // instance cannot drop the send (same pattern as scheduleWorkspaceAudit);
  // fall back inline for crons / non-request contexts where after() throws.
  const run = () =>
    dispatchEventNotifications(event).catch((err) => {
      logServerError("support.notify", err);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}

export function auditTenant(
  tenantId: string | null,
  action: string,
  summary: string,
  actorUserId: string | null,
  targetId: string,
  metadata?: Record<string, unknown>,
): void {
  if (!tenantId) return;
  scheduleWorkspaceAudit({
    tenantId,
    category: "messages",
    action,
    summary,
    actorUserId,
    actorKind: "staff",
    targetType: "support_ticket",
    targetId,
    metadata,
  });
}

export async function auditHq(
  actorUserId: string | null,
  ticketId: string,
  action: string,
  after?: Record<string, unknown>,
): Promise<void> {
  if (!actorUserId) return;
  await logPlatformAdminAction({
    actorUserId,
    targetKind: "workspace",
    targetId: ticketId,
    action,
    after,
    supportMode: "read_only",
    context: { ticketId, support_mode: "read_only" },
  });
}

