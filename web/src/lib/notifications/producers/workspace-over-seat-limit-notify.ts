import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import type { DispatchResult } from "@/lib/notifications/types";

/**
 * Emit `workspace.over_seat_limit` (spec §6.6) — a workspace's active roster has
 * grown past its plan's `talent_seat_limit`. The single catalog entry fans the
 * event out to the workspace owners + admins (`workspaceAdmins`), email + in-app,
 * with a CTA to the account + billing page.
 *
 * Dispatched directly from the weekly `usage-audit` cron (NOT through the
 * engine's `notifyUsers`), so the entry owns both channels with no
 * double-notify. `tenantId` is required for in-app delivery and to resolve the
 * workspace brand; the headcount + limit ride on the payload so the template and
 * the in-app bell can name the overage.
 *
 * `auditDate` (UTC YYYY-MM-DD) is folded into the stable `eventId`
 * (`seat-limit:<tenant>:<auditDate>`): a same-day re-run is a dedupe no-op (the
 * dispatch_log unique index collapses a duplicate `(event, recipient, channel)`),
 * while each new weekly run carries a fresh date and re-nudges a still-over
 * tenant. Returns the `DispatchResult` so the cron can sum per-tenant counts for
 * its summary line.
 */
export function notifyWorkspaceOverSeatLimit(params: {
  tenantId: string;
  workspaceName: string | null;
  planLabel: string | null;
  activeCount: number;
  seatLimit: number;
  auditDate: string;
}): Promise<DispatchResult> {
  return dispatchEventNotifications({
    type: "workspace.over_seat_limit",
    tenantId: params.tenantId,
    eventId: `seat-limit:${params.tenantId}:${params.auditDate}`,
    payload: {
      workspaceName: params.workspaceName,
      planLabel: params.planLabel,
      activeCount: params.activeCount,
      seatLimit: params.seatLimit,
    },
  });
}
