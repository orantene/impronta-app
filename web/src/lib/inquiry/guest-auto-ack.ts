import "server-only";

/**
 * guest-auto-ack.ts — P2: honest dynamic auto-ack + "email a copy" helper.
 *
 * Two responsibilities:
 *
 * 1. emitGuestAutoAck(...)
 *    Posts a system_event bubble into the GROUP thread after a guest's
 *    first message. The body is built dynamically from:
 *      a. The agency's custom auto_ack_message (if set).
 *      b. Otherwise: the honest P1 latency label (e.g. "~2h") woven in.
 *      c. Final fallback: a generic "we'll be in touch" if P1 returns null.
 *    Returns the created GuestThreadMessage (for StartGuestChatResult.autoAckMessage)
 *    or null when the ack is disabled or the insert fails.
 *
 *    Key difference from the existing auto-ack (inquiry-engine-submit.ts L632):
 *      - That one posts to the PRIVATE thread (staff only).
 *      - This one posts to the GROUP thread so the guest popup can see it.
 *
 * 2. sendGuestCopyEmail(...)
 *    Sends a transactional "here's a link back to your conversation" email
 *    to the guest's address. Reuses the existing sendEmail + email template
 *    pattern (lib/email/templates.ts layout). The link is a magic-link URL
 *    (auth.admin.generateLink) so the guest can claim their account on click.
 *    Fire-and-forget: failures are logged and swallowed, never thrown.
 *
 * Both functions are pure helpers — they do NOT call each other. The caller
 * (startGuestChatInquiry server action in Lane A) decides whether to call one
 * or both.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { getTypicalReplyLabel } from "@/lib/inquiry/guest-reply-latency";
import { sendEmail } from "@/lib/email";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import type { GuestThreadMessage } from "@/lib/inquiry/guest-chat-contract";

// ─────────────────────────────────────────────────────────────────────────────
// 1. emitGuestAutoAck
// ─────────────────────────────────────────────────────────────────────────────

export type EmitGuestAutoAckArgs = {
  inquiryId: string;
  tenantId: string;
  /** Used by P1 to narrow the typical-reply latency to this talent. */
  talentProfileId?: string | null;
  /**
   * Override from agencies.auto_ack_message. When set and non-empty, we use it
   * verbatim (it may reference "~X" which the tenant has already set). When
   * absent/empty we compose the body from P1 data.
   */
  customAckMessage?: string | null;
  /**
   * Whether auto-ack is enabled for this tenant.
   * Defaults to true (same as the existing engine-submit logic: null agency
   * row means auto_ack_enabled is implicitly true).
   */
  autoAckEnabled?: boolean;
};

/**
 * Post the auto-ack system bubble into the GROUP thread and return it as a
 * GuestThreadMessage so the caller can surface it immediately in the popup.
 *
 * Returns null when:
 *   - autoAckEnabled is false.
 *   - The insert fails (logged, not thrown).
 */
export async function emitGuestAutoAck(
  args: EmitGuestAutoAckArgs,
): Promise<GuestThreadMessage | null> {
  if (args.autoAckEnabled === false) return null;

  try {
    // Build the ack body.
    let body: string;

    if (args.customAckMessage?.trim()) {
      body = args.customAckMessage.trim();
    } else {
      // Try P1 for an honest latency label.
      const replyLabel = await getTypicalReplyLabel({
        tenantId: args.tenantId,
        talentProfileId: args.talentProfileId,
      });

      if (replyLabel) {
        // e.g. "Got it — we'll get back to you. Typically replies in ~2h."
        body = `Got it — we've received your message. ${replyLabel}.`;
      } else {
        // Fallback: honest but no specific timeframe.
        body = "Got it — we've received your message and will be in touch shortly.";
      }
    }

    // Insert into the GROUP thread as a system_event so it's visible to
    // the guest popup (unlike the existing private-thread ack).
    const admin = createServiceRoleClient();
    if (!admin) return null;

    const { data: row, error } = await admin
      .from("inquiry_messages")
      .insert({
        inquiry_id: args.inquiryId,
        tenant_id: args.tenantId,
        thread_type: "group",
        sender_user_id: null,
        body,
        message_kind: "system_event",
        metadata: { system_event_type: "workspace_auto_ack", channel: "guest_popup" },
      })
      .select("id, created_at")
      .single();

    if (error || !row) {
      if (error) {
        logServerError("guest-auto-ack/insert", error);
      }
      return null;
    }

    const ackRow = row as { id: string; created_at: string };

    // Return in GuestThreadMessage shape so startGuestChatInquiry can echo it.
    return {
      id: ackRow.id,
      inquiryId: args.inquiryId,
      authorRole: "system",
      authorLabel: null,
      authorAvatarUrl: null,
      body,
      kind: "system_event",
      cardPayload: null,
      createdAt: ackRow.created_at,
      editedAt: null,
      isDeleted: false,
      replyToMessageId: null,
    };
  } catch (err) {
    logServerError("guest-auto-ack/emitGuestAutoAck", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. sendGuestCopyEmail
// ─────────────────────────────────────────────────────────────────────────────

export type SendGuestCopyEmailArgs = {
  inquiryId: string;
  tenantId: string;
  /** Guest's email address (from StartGuestChatInput.contactEmail). */
  guestEmail: string;
  /** Guest's display name for the greeting. */
  guestName: string;
  /** The agency/talent name used in the copy. */
  agencyName: string;
  /**
   * Optional typical reply label from P1 (e.g. "Typically replies in ~2h").
   * When null the email omits the SLA line.
   */
  typicalReplyLabel?: string | null;
  /**
   * The claim/login URL the guest should use to view their conversation.
   * Typically a Supabase magic-link (auth.admin.generateLink) with a redirect
   * to the client messages surface. If null, the email links to the public
   * talent page instead (the guest hasn't been provisioned yet — 'unlinked').
   */
  claimUrl: string | null;
  /** Fallback URL (public talent profile) used when claimUrl is null. */
  publicProfileUrl: string;
};

/**
 * Send a "we received your message" email to the guest with a link back to
 * their conversation. Uses the existing email infrastructure (Resend +
 * sendEmail). Fire-and-forget: failures are logged and never thrown.
 */
export async function sendGuestCopyEmail(args: SendGuestCopyEmailArgs): Promise<void> {
  try {
    const brand = await resolveTenantBrand(args.tenantId);
    const { html, subject } = _buildGuestCopyEmailHtml(args, brand);

    await sendEmail({
      to: args.guestEmail,
      subject,
      html,
    });
  } catch (err) {
    logServerError("guest-auto-ack/sendGuestCopyEmail", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email template helper (no @react-email — plain HTML for simplicity,
// matching the style of lib/email/templates.ts layout)
// ─────────────────────────────────────────────────────────────────────────────

function _buildGuestCopyEmailHtml(
  args: SendGuestCopyEmailArgs,
  brand: { wordmark: string; accountName: string; footerDomain: string; homeHref: string },
): { subject: string; html: string } {
  const greeting = args.guestName.trim() ? `Hi ${args.guestName.split(" ")[0]}` : "Hi";
  const linkHref = args.claimUrl ?? args.publicProfileUrl;
  const ctaLabel = args.claimUrl ? "View your conversation →" : "Return to profile →";

  const replyLine = args.typicalReplyLabel
    ? `<p style="margin:0 0 8px;font-size:14px;color:#555555;">${args.typicalReplyLabel}.</p>`
    : "";

  const claimNote = args.claimUrl
    ? `<p style="margin:12px 0 0;font-size:12px;color:#888888;">This link logs you in automatically — keep it private.</p>`
    : "";

  const subject = `Your message to ${args.agencyName} is on its way`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <a href="${brand.homeHref}" style="font-family:Georgia,serif;font-size:18px;letter-spacing:0.2em;color:#1a1a1a;text-decoration:none;font-weight:600;">${brand.wordmark}</a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;padding:32px 32px 28px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Message received</h2>
              <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
                ${greeting}, your message to <strong>${args.agencyName}</strong> was sent.
              </p>
              ${replyLine}
              <p style="margin:0;font-size:14px;color:#555555;">
                You can view your conversation and any replies using the link below.
              </p>
              <a href="${linkHref}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#0b0b0d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${ctaLabel}</a>
              ${claimNote}
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;text-align:center;font-size:12px;color:#888888;">
              You received this because you messaged ${brand.accountName}.
              <br/>
              <a href="${brand.homeHref}" style="color:#888888;">${brand.footerDomain}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. generateGuestClaimUrl — helper to produce a Supabase magic-link for the
//    "email a copy" flow. Returns null when the admin client is unavailable or
//    the provisioned clientUserId is null (unlinked guest).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a one-time magic-link for the guest so they can claim their account
 * and view the conversation. The redirect_to URL is the client messages surface
 * with the inquiry pre-selected.
 *
 * Returns null on any failure (logged, never thrown).
 */
export async function generateGuestClaimUrl(args: {
  clientUserId: string;
  guestEmail: string;
  inquiryId: string;
  /** Base URL of the deployment, e.g. https://app.tulala.digital */
  siteUrl: string;
  tenantSlug: string;
}): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;

    const redirectTo = `${args.siteUrl}/${args.tenantSlug}/client/messages?inquiry=${args.inquiryId}`;

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: args.guestEmail,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      if (error) logServerError("guest-auto-ack/generateGuestClaimUrl", error);
      return null;
    }

    return data.properties.action_link;
  } catch (err) {
    logServerError("guest-auto-ack/generateGuestClaimUrl", err);
    return null;
  }
}
