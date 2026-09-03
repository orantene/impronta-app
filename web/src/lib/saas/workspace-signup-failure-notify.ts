// Provisioning-failure email plumbing — extracted from
// `workspace-signup.server.ts` to keep that file under the 800-line cap.
//
// When `provisionWorkspaceFromLead` returns `{ ok: false }` for a reason
// that needs a human (Stripe transient, schema drift, role collision),
// we email the lead's address with a "we'll be in touch" message and
// stamp a dedup marker into `saas_marketing_signups.notes` so refreshing
// the error card doesn't spam the user.

import {
  renderWorkspaceSignupFailureEmail,
  type WorkspaceSignupFailureKind,
} from "@/lib/email/workspace-signup-failed";
import { sendEmail } from "@/lib/email";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { notifyPlatformSignupFailed } from "./workspace-signup-platform-alerts";

const PROVISION_FAILURE_NOTE_MARKER = "[provision-failure-emailed]";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "hello@impronta.group";

// Subset of MarketingLeadRow needed for the failure-email path. Kept
// structural so the caller doesn't have to export its internal row type.
export type FailureNotifyLead = {
  id: string;
  email: string;
  name: string;
  notes: string | null;
};

async function markLeadFailureEmailed(
  leadId: string,
  priorNotes: string | null,
): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  const stamped = `${PROVISION_FAILURE_NOTE_MARKER}:${new Date().toISOString()}`;
  const next =
    priorNotes && priorNotes.trim().length > 0
      ? `${priorNotes.trim()}\n${stamped}`
      : stamped;
  const { error } = await admin
    .from("saas_marketing_signups")
    .update({ notes: next })
    .eq("id", leadId);
  if (error) {
    logServerError("workspace-signup.markLeadFailureEmailed", error);
  }
}

export async function sendProvisioningFailureEmailOnce(params: {
  lead: FailureNotifyLead;
  kind: WorkspaceSignupFailureKind;
}): Promise<void> {
  // Dedup: if we already stamped the marker, don't resend.
  if (params.lead.notes?.includes(PROVISION_FAILURE_NOTE_MARKER)) {
    return;
  }
  const recipient = params.lead.email?.trim();
  if (!recipient) return;
  const ownerName =
    params.lead.name?.trim() || recipient.split("@")[0] || "there";

  // Alert platform admins that a signup failed — separate audience from the
  // user-facing "we'll be in touch" email below, so it fires regardless of
  // that send's outcome.
  notifyPlatformSignupFailed({
    leadId: params.lead.id,
    attemptedEmail: recipient,
    reason: params.kind,
  });

  try {
    await sendEmail({
      to: recipient,
      subject: `Tulala workspace setup — we'll be in touch`,
      html: renderWorkspaceSignupFailureEmail({
        ownerName,
        leadId: params.lead.id,
        kind: params.kind,
        supportEmail: SUPPORT_EMAIL,
      }),
      // EMAIL_REPLY_TO is unset everywhere, so this always resolves to
      // SUPPORT_EMAIL. Unlike the platform From address, that one is real:
      // impronta.group publishes Google Workspace MX and a valid SPF record,
      // so a reply is delivered rather than bounced. Kept deliberately — this
      // mail goes to somebody whose signup just failed, which is the single
      // most reply-worthy message we send.
      replyTo: SUPPORT_EMAIL,
    });
  } catch (err) {
    logServerError("workspace-signup.provisionFailureEmail", err);
    return; // don't stamp the marker if the send threw
  }
  await markLeadFailureEmailed(params.lead.id, params.lead.notes);
}
