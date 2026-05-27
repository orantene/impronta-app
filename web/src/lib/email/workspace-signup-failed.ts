// Transactional email sent when `provisionWorkspaceFromLead` fails in a
// way that needs a human (claimed_elsewhere, unsupported_existing_role,
// service_unavailable, provision_failed). The user has already filled in
// /get-started and likely paid intent — they should hear from us, not
// silently get stuck on the error card.

import { PLATFORM_BRAND } from "@/lib/platform/brand";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type WorkspaceSignupFailureKind =
  | "service_unavailable"
  | "provision_failed"
  | "claimed_elsewhere"
  | "unsupported_existing_role";

const KIND_BLURB: Record<WorkspaceSignupFailureKind, string> = {
  service_unavailable:
    "We hit a temporary hiccup while opening your workspace. No charge has been made.",
  provision_failed:
    "Setup didn't finish on our side. Your account is safe and nothing has been charged yet.",
  claimed_elsewhere:
    "It looks like this signup request was already claimed by another account.",
  unsupported_existing_role:
    "Your account is already attached to a client or talent flow, so workspace creation needs a small assist from us.",
};

export function renderWorkspaceSignupFailureEmail(args: {
  ownerName: string;
  leadId: string;
  kind: WorkspaceSignupFailureKind;
  supportEmail: string;
}): string {
  const safeName = escapeHtml(args.ownerName || "there");
  const safeLead = escapeHtml(args.leadId);
  const safeSupport = escapeHtml(args.supportEmail);
  const blurb = escapeHtml(KIND_BLURB[args.kind]);

  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f1ede3;font-family:'Geist',Inter,system-ui,sans-serif;color:#0f1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:20px;border:1px solid rgba(15,23,20,0.08);">
    <tr><td style="padding:40px 40px 32px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.26em;text-transform:uppercase;color:#a8543f;">We hit a snag</div>
      <h1 style="font-family:'Geist',Inter,system-ui,sans-serif;font-size:26px;line-height:1.2;font-weight:500;margin:16px 0 0;color:#0f1714;letter-spacing:-0.02em;">Hi ${safeName},</h1>
      <p style="margin:20px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">
        ${blurb}
      </p>
      <p style="margin:16px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">
        A founder will reach out shortly to finish setup by hand. If you want to nudge us, reply to this email or write
        <a href="mailto:${safeSupport}" style="color:#1f4a3a;">${safeSupport}</a> and include the reference below.
      </p>
      <div style="margin:24px 0 0;padding:14px 16px;background:rgba(15,23,20,0.04);border-radius:12px;font-family:'Geist Mono',ui-monospace,monospace;font-size:13px;color:#3a4541;">
        Lead reference: ${safeLead}
      </div>
      <hr style="border:none;border-top:1px solid rgba(15,23,20,0.08);margin:32px 0;"/>
      <p style="margin:0;color:#6b766f;font-size:13px;line-height:1.6;">— The ${PLATFORM_BRAND.name} team</p>
    </td></tr>
  </table>
</body></html>`;
}
