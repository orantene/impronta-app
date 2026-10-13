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
import { improntaLog } from "@/lib/server/structured-log";
import { sendEmailResult } from "@/lib/email";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildGuestClaimEmail } from "./guest-claim-email";

/** The guest's page language when called inside a request; null outside one. */
async function guestRequestLocale(): Promise<string | null> {
  try {
    return await getRequestLocale();
  } catch {
    return null;
  }
}

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
  /** Guest's language ("es" | "en"); falls back to the tenant's brand locale, then English. */
  locale?: string | null;
};

export type SendGuestClaimEmailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "no_admin" | "no_email" | "link_failed" | "skipped" | "send_failed";
      detail?: string;
    };

/**
 * Email the guest a magic-link that signs them in and drops them into their
 * client Messages, where their conversation is waiting.
 *
 * Returns whether Resend actually accepted the message. Callers that show
 * "check your inbox" MUST gate on `ok: true` — when RESEND_API_KEY is unset
 * (local dev) this returns `{ ok: false, reason: "skipped" }` instead of
 * pretending the mail went out.
 */
export async function sendGuestClaimEmail(
  args: SendGuestClaimEmailArgs,
): Promise<SendGuestClaimEmailResult> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "no_admin" };

    const email = args.email.trim().toLowerCase();
    if (!email) return { ok: false, reason: "no_email" };

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
      return {
        ok: false,
        reason: "link_failed",
        detail: error?.message,
      };
    }
    const claimLink = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(
      tokenHash,
    )}&type=magiclink&next=${encodeURIComponent(next)}`;

    const brand = await resolveTenantBrand(args.tenantId ?? "");
    const { subject, html } = buildGuestClaimEmail(claimLink, args.talentName, brand, args.locale ?? (await guestRequestLocale()) ?? brand.locale);

    const sendResult = await sendEmailResult({
      to: email,
      subject,
      html,
      tenantId: args.tenantId ?? null,
      tenantName: brand.accountName,
    });

    if (sendResult.status === "sent") {
      return { ok: true };
    }

    if (sendResult.status === "skipped") {
      void improntaLog("email.warn", {
        message: "[guest-claim-link] RESEND_API_KEY not set — claim email skipped",
        email,
        subject,
      });
      return { ok: false, reason: "skipped" };
    }

    return {
      ok: false,
      reason: "send_failed",
      detail: sendResult.error,
    };
  } catch (err) {
    logServerError("guest-claim-link/sendGuestClaimEmail", err);
    return {
      ok: false,
      reason: "send_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
