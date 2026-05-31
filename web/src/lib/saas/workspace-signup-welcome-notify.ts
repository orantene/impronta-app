import "server-only";

// Owner-facing welcome for the workspace signup flow (spec §6.6 / §12), routed
// through the notification dispatcher rather than a direct send. Extracted from
// `workspace-signup.server.ts` to keep that file under its 800-line cap (same
// split rationale as the failure-email + platform-alert helpers). Unlike those
// platform alerts, this is tenant-scoped: `tenantId` carries the agency brand
// so the email + dashboard link render on the owner's host, and `ownerUserId`
// is the recipient the catalog's `eventUser` resolver targets.

import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Emit `workspace.signup_completed`; the catalog entry `workspace.signup_welcome`
 * renders the branded welcome email. Fire-and-forget — the dispatcher no-ops
 * without RESEND_API_KEY and the stable `eventId` dedupes a retried provision
 * for the same tenant.
 */
export function notifyWorkspaceSignupWelcome(params: {
  tenantId: string;
  ownerUserId: string;
  ownerName: string;
  workspaceName: string;
  planLabel: string;
  adminPath: string;
  publicUrl: string;
}): void {
  const appBase = getAppUrl();
  void dispatchEventNotifications({
    type: "workspace.signup_completed",
    tenantId: params.tenantId,
    userId: params.ownerUserId,
    eventId: `workspace-welcome:${params.tenantId}`,
    payload: {
      ownerName: params.ownerName,
      workspaceName: params.workspaceName,
      planLabel: params.planLabel,
      adminUrl: `${appBase}${params.adminPath}`,
      publicUrl: params.publicUrl,
    },
  }).catch((err) => {
    logServerError("workspace-signup.welcomeEmail", err);
  });
}
