import "server-only";

/**
 * guest-claim-link.ts — the GUEST → REGISTERED-CLIENT claim path.
 *
 * When a guest starts a conversation from a talent profile, the inquiry is
 * provisioned against a real (passwordless) client auth account whose email is
 * the guest's (see ensureGuestClientByEmail). The guest, however, has no way IN
 * to that account: registering with the same email errors `user_already_exists`,
 * the random password is unknown, and there is no claim path. This module is
 * that claim path.
 *
 * `sendGuestClaimEmail` emails the guest a Supabase magic-link. Clicking it:
 *   1. hits Supabase /auth/v1/verify, which 302s to our `/auth/callback?next=…`
 *      with a one-time `code`,
 *   2. `/auth/callback` calls `exchangeCodeForSession(code)` → sets the SSR
 *      session cookies (this is what proves email ownership and logs them in),
 *   3. the callback resolves the post-auth destination and lands them on the
 *      client Messages surface, where their conversation is listed by
 *      `client_user_id` (which already equals the account they just signed into).
 *
 * CRITICAL: the magic-link `redirectTo` MUST point at `/auth/callback` (not the
 * messages page directly). The /verify redirect carries the auth code that only
 * the callback exchanges into a session — redirecting straight to the dashboard
 * would land the guest there with no session and bounce them to login.
 *
 * NON-BLOCKING by contract: every path is wrapped in try/catch + logServerError
 * and the function returns void. The inquiry is already created before this runs;
 * a mail/link failure must NEVER throw back into the caller.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { sendEmail } from "@/lib/email";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";

export type SendGuestClaimEmailArgs = {
  /** Guest's email address — the address the client account was provisioned for. */
  email: string;
  /** Tenant slug for the post-auth destination (`/{tenantSlug}/client/messages`). */
  tenantSlug: string;
  /** Talent display name used in the subject + body copy. */
  talentName: string;
  /** Base URL of the deployment, e.g. https://app.tulala.digital. From getAppUrl(). */
  appUrl: string;
  /**
   * Optional tenant id — when provided, the email is branded with the agency's
   * wordmark / footer domain (resolveTenantBrand). Omit for the platform brand.
   */
  tenantId?: string | null;
};

/**
 * Email the guest a magic-link that signs them in and drops them into their
 * client Messages, where their conversation is waiting. Fire-and-forget:
 * NEVER throws — every failure is logged and swallowed.
 */
export async function sendGuestClaimEmail(args: SendGuestClaimEmailArgs): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return;

    const email = args.email.trim().toLowerCase();
    if (!email) return;

    const appUrl = args.appUrl.replace(/\/$/, "");
    const next = `/${args.tenantSlug}/client/messages`;
    const redirectTo = `${appUrl}/auth/confirm?next=${encodeURIComponent(next)}`;

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    // Use the token_hash (server-side verifyOtp flow), NOT properties.action_link.
    // action_link uses Supabase's implicit/hash flow (#access_token=…) which the
    // app's PKCE-only /auth/callback can't consume — the URL fragment never reaches
    // the server, so it bounces to /login?error=auth. Our /auth/confirm route calls
    // supabase.auth.verifyOtp({ token_hash, type }) and sets the SSR session cookies.
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      if (error) logServerError("guest-claim-link/generateLink", error);
      return;
    }
    const claimLink = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(
      tokenHash,
    )}&type=magiclink&next=${encodeURIComponent(next)}`;

    const brand = await resolveTenantBrand(args.tenantId ?? "");
    const { subject, html } = _buildClaimEmail(claimLink, args.talentName, brand);

    await sendEmail({
      to: email,
      subject,
      html,
      tenantId: args.tenantId ?? null,
      tenantName: brand.accountName,
    });
  } catch (err) {
    logServerError("guest-claim-link/sendGuestClaimEmail", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email template — plain, minimal HTML matching lib/email/templates.ts layout.
// ─────────────────────────────────────────────────────────────────────────────

function _escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _buildClaimEmail(
  actionLink: string,
  talentName: string,
  brand: { wordmark: string; accountName: string; footerDomain: string; homeHref: string },
): { subject: string; html: string } {
  const safeName = _escape(talentName.trim() || brand.accountName);
  const subject = `Continue your conversation with ${talentName.trim() || brand.accountName}`;

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
              <a href="${brand.homeHref}" style="font-family:Georgia,serif;font-size:18px;letter-spacing:0.2em;color:#1a1a1a;text-decoration:none;font-weight:600;">${_escape(brand.wordmark)}</a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;padding:32px 32px 28px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Pick up where you left off</h2>
              <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
                Your conversation with <strong>${safeName}</strong> is saved. Use the button below to sign in and continue it from your dashboard — no password needed.
              </p>
              <a href="${actionLink}" style="display:inline-block;margin-top:4px;padding:12px 24px;background:#0b0b0d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Pick up the conversation →</a>
              <p style="margin:16px 0 0;font-size:12px;color:#888888;">This link signs you in automatically — keep it private. It works on any device.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;text-align:center;font-size:12px;color:#888888;">
              You received this because you started a conversation on ${_escape(brand.accountName)}.
              <br/>
              <a href="${brand.homeHref}" style="color:#888888;">${_escape(brand.footerDomain)}</a>
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
