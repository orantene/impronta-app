import "server-only";

// Platform-admin alerts for the workspace signup flow (spec §6.7 / §12).
//
// Both emits route through the notification dispatcher rather than sending
// email directly. Extracted from `workspace-signup.server.ts` so that file
// stays under its 800-line cap (same split rationale as the failure-email
// helper). `tenantId` is intentionally null on both: no tenant brand should
// override the Tulala platform brand on an admin-facing alert, and for the
// failure case no workspace exists yet. The stable `eventId` is the dispatcher
// idempotency anchor — a retried signup/failure for the same lead/tenant
// dedupes instead of re-alerting.

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";

/** Alert platform admins that a new workspace signed up — platform.new_workspace. */
export function notifyPlatformNewWorkspace(args: {
  tenantId: string;
  workspaceName: string;
  ownerEmail: string;
  planLabel: string;
}): void {
  void dispatchEventNotifications({
    type: "workspace.created",
    tenantId: null,
    eventId: `workspace-created:${args.tenantId}`,
    payload: {
      workspaceName: args.workspaceName,
      ownerEmail: args.ownerEmail,
      planLabel: args.planLabel,
    },
  });
}

/** Alert platform admins that a signup failed — platform.workspace_signup_failed. */
export function notifyPlatformSignupFailed(args: {
  leadId: string;
  attemptedEmail: string;
  reason: string;
}): void {
  void dispatchEventNotifications({
    type: "platform.workspace_signup_failed",
    tenantId: null,
    eventId: `signup-failed:${args.leadId}`,
    payload: {
      attemptedEmail: args.attemptedEmail,
      reason: args.reason,
    },
  });
}
