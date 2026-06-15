// Supabase "Send Email" auth hook — Deno Edge Function variant (OPTIONAL).
//
// STATUS: NOT the live path. Production auth emails are handled by the in-app
// Next.js route POST /api/hooks/auth-email (see web/src/app/api/hooks/auth-email/
// route.ts), which renders the branded React templates and logs to the platform
// email console. This Deno function is a ready-to-deploy ALTERNATIVE for teams
// that prefer the hook to run on Supabase's Edge runtime instead of the app.
//
// It is functionally equivalent at the wire level: verifies the Standard-Webhooks
// signature, renders a branded (EN/ES) auth email, sends via Resend, and writes a
// notification_dispatch_log row so the send shows in /platform/admin/email.
//
// To adopt it (do NOT do this unless you specifically want the Edge variant):
//   1. supabase functions deploy send-email-hook --no-verify-jwt
//   2. set function secrets: RESEND_API_KEY, SEND_EMAIL_HOOK_SECRET,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   3. Supabase → Auth → Hooks → Send Email Hook → point at this function URL +
//      paste the signing secret. (This REPLACES the in-app HTTPS hook — pick one.)
//
// Deno runtime: this file is intentionally outside web/ and is not covered by the
// app's tsc/lint gate (it imports Deno/esm.sh modules).

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "https://esm.sh/resend@4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const hook = new Webhook(Deno.env.get("SEND_EMAIL_HOOK_SECRET")!.replace(/^v1,/, "").replace(/^whsec_/, ""));
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const FROM = "Tulala <noreply@tulala.digital>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.tulala.digital";

type Locale = "en" | "es";

// Mirror of web/src/lib/notifications/email-copy auth entries (subject + body),
// kept inline because Deno can't import the app's React templates.
const COPY: Record<string, Record<Locale, { subject: string; heading: string; intro: string; button: string }>> = {
  recovery: {
    en: { subject: "Reset your password", heading: "Reset your password", intro: "Click the button below to choose a new password. This link expires in 1 hour.", button: "Reset password →" },
    es: { subject: "Restablece tu contraseña", heading: "Restablece tu contraseña", intro: "Haz clic en el botón de abajo para elegir una nueva contraseña. El enlace caduca en 1 hora.", button: "Restablecer contraseña →" },
  },
  magiclink: {
    en: { subject: "Your sign-in link", heading: "Sign in", intro: "Click the button below to sign in. This link is single-use and expires in 1 hour.", button: "Sign in →" },
    es: { subject: "Tu enlace para iniciar sesión", heading: "Inicia sesión", intro: "Haz clic en el botón de abajo para iniciar sesión. El enlace es de un solo uso y caduca en 1 hora.", button: "Iniciar sesión →" },
  },
  signup: {
    en: { subject: "Confirm your email", heading: "Confirm your email", intro: "Click the button below to confirm your email and activate your account.", button: "Confirm email →" },
    es: { subject: "Confirma tu correo", heading: "Confirma tu correo", intro: "Haz clic en el botón de abajo para confirmar tu correo y activar tu cuenta.", button: "Confirmar correo →" },
  },
  email_change: {
    en: { subject: "Confirm your new email", heading: "Confirm your new email", intro: "Click the button below to confirm the change to your account email.", button: "Confirm new email →" },
    es: { subject: "Confirma tu nuevo correo", heading: "Confirma tu nuevo correo", intro: "Haz clic en el botón de abajo para confirmar el cambio de correo de tu cuenta.", button: "Confirmar nuevo correo →" },
  },
};

function copyKey(action: string): string {
  if (action === "recovery") return "recovery";
  if (action === "magiclink") return "magiclink";
  if (action === "email_change" || action === "email_change_new") return "email_change";
  return "signup"; // signup, invite, default
}

function localeFromRedirect(redirectTo?: string): Locale {
  if (!redirectTo) return "en";
  try {
    const lang = new URL(redirectTo).searchParams.get("lang") ?? "";
    return lang.toLowerCase().startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
}

function renderHtml(c: { heading: string; intro: string; button: string }, url: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:40px 16px;color:#1a1a1a">
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:32px">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700">${c.heading}</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.6">${c.intro}</p>
      <a href="${url}" style="display:inline-block;margin-top:8px;padding:12px 24px;background:#c9a227;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">${c.button}</a>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  const payload = await req.text();
  // deno-lint-ignore no-explicit-any
  let data: any;
  try {
    data = hook.verify(payload, Object.fromEntries(req.headers));
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: "invalid signature" } }), { status: 401 });
  }

  const user = data.user ?? {};
  const ed = data.email_data ?? {};
  const action = (ed.email_action_type as string) ?? "magiclink";
  const tokenHash = ed.token_hash as string | undefined;
  const email = user.email as string | undefined;
  if (!email || !tokenHash) {
    return new Response(JSON.stringify({ error: { http_code: 400, message: "missing email/token_hash" } }), { status: 400 });
  }

  const locale = localeFromRedirect(ed.redirect_to);
  const c = COPY[copyKey(action)][locale];
  const type = action === "email_change_new" ? "email_change" : action === "invite" ? "invite" : action;
  const params = new URLSearchParams({ token_hash: tokenHash, type });
  if (ed.redirect_to) {
    try {
      const p = new URL(ed.redirect_to).pathname;
      if (p && p !== "/") params.set("next", p);
    } catch { /* relative redirect — use default */ }
  }
  const url = `${APP_URL}/auth/confirm?${params.toString()}`;

  const { data: sent, error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: c.subject,
    html: renderHtml(c, url),
  });

  // Best-effort console logging (mirrors the in-app hook's dispatch_log row).
  await admin.from("notification_dispatch_log").insert({
    tenant_id: null,
    recipient_user_id: user.id ?? null,
    recipient_email: email,
    event_kind: `auth.${action}`,
    channel: "email",
    status: error ? "failed" : "sent",
    dedupe_key: `auth:${action}:${tokenHash}`,
    template_id: `auth.${action}`,
    catalog_entry_id: `auth.${action}`,
    locale,
    payload: { action },
    provider_reference: sent?.id ?? null,
    error_message: error?.message ?? null,
  });

  if (error) {
    return new Response(JSON.stringify({ error: { http_code: 500, message: error.message } }), { status: 500 });
  }
  return new Response("{}", { headers: { "content-type": "application/json" } });
});
