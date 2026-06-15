import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import type { DispatchResult } from "@/lib/notifications/types";

/**
 * Emit `platform.workspace_over_quota` (spec §12) — a workspace has exceeded a
 * per-tenant plan quota that the seat-limit sweep does NOT cover (e.g. the
 * `agency_entitlements.max_active_roster_size` roster cap). The single catalog
 * entry fans this out to PLATFORM super-admins (upsell/визibility signal), so it
 * is distinct from `workspace.over_seat_limit` (which goes to the workspace).
 *
 * Platform-admin convention (catalog.ts): `tenantId` MUST be null so the
 * dispatcher resolves the platform brand and the CTA points at /platform/admin.
 * The flagged workspace's id rides in the stable `eventId` for dedupe only; all
 * display data (name, metric, usage) is on the payload (the entry has no
 * hydrate). The metric is part of the eventId so a storage overage and a roster
 * overage for the same tenant dedupe independently.
 *
 * Returns the DispatchResult so the usage-audit cron can sum per-tenant counts.
 */
export function notifyWorkspaceOverQuota(params: {
  /** The workspace being flagged — used only for the dedupe eventId. */
  workspaceTenantId: string;
  workspaceName: string | null;
  /** Which quota was exceeded, e.g. "roster" / "storage". */
  metricLabel: string;
  /** Human usage vs cap, e.g. "7 of 5 talent". */
  usageLabel: string;
  /** UTC YYYY-MM-DD; folds into the eventId so a same-day re-run is a no-op. */
  auditDate: string;
}): Promise<DispatchResult> {
  const metricKey = params.metricLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return dispatchEventNotifications({
    type: "platform.workspace_over_quota",
    tenantId: null, // platform-admin audience — never the flagged tenant
    eventId: `over-quota:${params.workspaceTenantId}:${metricKey}:${params.auditDate}`,
    payload: {
      workspaceName: params.workspaceName,
      metricLabel: params.metricLabel,
      usageLabel: params.usageLabel,
    },
  });
}
