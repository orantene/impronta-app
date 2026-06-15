/**
 * Supabase "Send Email" auth hook → Resend, logged to the platform console.
 *
 * Endpoint: POST /api/hooks/auth-email   (Standard-Webhooks signed)
 *
 * When the Send Email Hook is enabled (Supabase dashboard → Authentication →
 * Hooks), Supabase STOPS using its built-in mailer / SMTP for auth emails and
 * POSTs each one here instead. This route:
 *   1. verifies the Standard-Webhooks signature (SEND_EMAIL_HOOK_SECRET),
 *   2. renders the matching BRANDED React Email template (emails/auth/*),
 *   3. sends it via Resend (platform sender, noreply@tulala.digital),
 *   4. writes a `notification_dispatch_log` row so the email shows up in
 *      /platform/admin/email alongside every other email.
 *
 * That last step is the whole point of Option B over plain SMTP: auth mail is
 * now visible + tracked in the platform-admin console, not only in Resend's own
 * dashboard.
 *
 * Configuration (BOTH required before enabling the hook in Supabase):
 *   SEND_EMAIL_HOOK_SECRET     — the signing secret Supabase shows when you add
 *                                the hook (format `v1,whsec_…`). Set in Vercel.
 *   RESEND_API_KEY             — already set in prod; the actual sender.
 *   SUPABASE_SERVICE_ROLE_KEY  — already set; for the dispatch_log write.
 *
 * Without the signing secret the route returns 503 (refuses every request) so a
 * misconfigured deploy never sends unsigned auth mail — enable the Supabase hook
 * only AFTER the secret is live in Vercel.
 *
 * Response contract (Supabase Send Email Hook): 200 + `{}` on success; on
 * failure `{ error: { http_code, message } }` so the auth flow surfaces it.
 */

import { NextResponse, type NextRequest } from "next/server";
import * as React from "react";

import { verifyResendSignature } from "@/lib/notifications/resend-webhook";
import { sendEmailResult } from "@/lib/email";
import { renderEmailHtml } from "@/lib/email/render";
import { platformBrand } from "@/lib/brand/resolve-tenant-brand";
import { getEmailCopy, normalizeEmailLocale, type EmailCopyKey } from "@/lib/notifications/email-copy";
import { getAppUrl, normalizeNextPath } from "@/lib/auth-flow";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

import PasswordReset from "../../../../../emails/auth/PasswordReset";
import MagicLink from "../../../../../emails/auth/MagicLink";
import SignupConfirm from "../../../../../emails/auth/SignupConfirm";
import EmailChange from "../../../../../emails/auth/EmailChange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmailData = {
  token?: string;
  token_hash?: string;
  redirect_to?: string;
  email_action_type?: string;
  site_url?: string;
  new_email?: string;
};

type HookPayload = {
  user?: { id?: string; email?: string; new_email?: string };
  email_data?: EmailData;
};

/** Map a Supabase email_action_type to the bilingual copy key for its subject. */
function copyKeyFor(action: string): EmailCopyKey {
  switch (action) {
    case "recovery":
      return "auth.recovery";
    case "magiclink":
      return "auth.magiclink";
    case "email_change":
    case "email_change_new":
      return "auth.email_change";
    case "signup":
    case "invite":
    default:
      return "auth.signup";
  }
}

/**
 * Locale for the auth email. There's no per-user locale in Supabase, so the
 * app's auth actions append `?lang=es` to redirectTo (the language of the page
 * the user was on); we read it back here. Defaults to English.
 */
function localeFromRedirect(redirectTo: string | undefined): "en" | "es" {
  if (!redirectTo) return "en";
  try {
    return normalizeEmailLocale(new URL(redirectTo).searchParams.get("lang"));
  } catch {
    return "en";
  }
}

/** Build the in-app token_hash verification link (/auth/confirm consumes it). */
function confirmUrl(action: string, tokenHash: string, redirectTo: string | undefined): string {
  const base = getAppUrl().replace(/\/$/, "");
  // /auth/confirm expects an EmailOtpType in `type`; map the action through.
  const type =
    action === "email_change_new" ? "email_change" : action === "invite" ? "invite" : action;
  const params = new URLSearchParams({ token_hash: tokenHash, type });
  if (redirectTo) {
    try {
      const next = normalizeNextPath(new URL(redirectTo).pathname);
      if (next) params.set("next", next);
    } catch {
      /* redirect_to wasn't an absolute URL — let /auth/confirm use its default */
    }
  }
  return `${base}/auth/confirm?${params.toString()}`;
}

function renderTemplate(
  action: string,
  url: string,
  newEmail: string | undefined,
  locale: "en" | "es",
) {
  // Platform brand carries the locale so the templates render in EN/ES.
  const brand = { ...platformBrand(), locale };
  switch (action) {
    case "recovery":
      return React.createElement(PasswordReset, { resetUrl: url, brand });
    case "magiclink":
      return React.createElement(MagicLink, { magicUrl: url, brand });
    case "email_change":
    case "email_change_new":
      return React.createElement(EmailChange, { confirmUrl: url, newEmail: newEmail ?? "", brand });
    case "signup":
    case "invite":
    default:
      return React.createElement(SignupConfirm, { confirmUrl: url, brand });
  }
}

function hookError(httpCode: number, message: string) {
  return NextResponse.json({ error: { http_code: httpCode, message } }, { status: httpCode });
}

export async function POST(req: NextRequest) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) {
    // Fail-safe: never accept unsigned auth mail. Enable the Supabase hook only
    // after this secret is set in the deploy environment.
    return NextResponse.json({ error: "Auth email hook not configured" }, { status: 503 });
  }

  // Raw body required for signature verification — read before parsing.
  const body = await req.text();
  // Supabase prefixes the secret with `v1,`; verifyResendSignature strips `whsec_`.
  const verified = verifyResendSignature(secret.replace(/^v1,/, ""), body, {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  });
  if (!verified) return hookError(401, "Invalid signature");

  let payload: HookPayload;
  try {
    payload = JSON.parse(body) as HookPayload;
  } catch {
    return hookError(400, "Invalid JSON");
  }

  const email = payload.user?.email;
  const data = payload.email_data ?? {};
  const action = data.email_action_type ?? "magiclink";
  const tokenHash = data.token_hash;
  if (!email) return hookError(400, "Missing recipient email");
  if (!tokenHash) return hookError(400, "Missing token_hash");

  const url = confirmUrl(action, tokenHash, data.redirect_to);
  const newEmail = data.new_email ?? payload.user?.new_email;
  const locale = localeFromRedirect(data.redirect_to);
  const subject = getEmailCopy(locale)[copyKeyFor(action)].subject;

  let html: string;
  try {
    html = await renderEmailHtml(renderTemplate(action, url, newEmail, locale));
  } catch (err) {
    logServerError("hooks.auth-email.render", err);
    return hookError(500, "Render failed");
  }

  const result = await sendEmailResult({ to: email, subject, html });

  // Best-effort console logging — auth mail shows in /platform/admin/email.
  const admin = createServiceRoleClient();
  if (admin) {
    const status = result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "skipped";
    await admin
      .from("notification_dispatch_log")
      .insert({
        tenant_id: null,
        recipient_user_id: payload.user?.id ?? null,
        recipient_email: email,
        event_kind: `auth.${action}`,
        channel: "email",
        status,
        dedupe_key: `auth:${action}:${tokenHash}`,
        template_id: `auth.${action}`,
        catalog_entry_id: `auth.${action}`,
        locale,
        payload: { action },
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
        provider_reference: result.status === "sent" ? result.id : null,
        error_message: result.status === "failed" ? result.error : null,
      })
      .then(({ error }) => {
        // 23505 = duplicate dedupe_key (Supabase retried the hook) — expected.
        if (error && (error as { code?: string }).code !== "23505") {
          logServerError("hooks.auth-email.log", error);
        }
      });
  }

  if (result.status === "failed") return hookError(500, result.error);

  // `skipped` means RESEND_API_KEY is unset (should never happen in prod). We
  // return 200 so a missing key never hard-blocks signup/login, but it's logged
  // loudly above (status=skipped) and visible in the console.
  if (result.status === "skipped") {
    void improntaLog("hooks.auth-email.skipped", { action, recipient: email });
  } else {
    void improntaLog("hooks.auth-email.sent", { action, recipient: email, id: result.id });
  }
  return NextResponse.json({});
}
