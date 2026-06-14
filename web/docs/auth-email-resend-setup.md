# Routing Supabase auth emails through Resend (setup runbook)

> Status: **ready to activate — requires a Supabase dashboard step you must do**
> (config.toml does NOT propagate to the hosted project, and routing auth mail
> through Resend needs a Resend credential you provision). This runbook gives two
> options; **Option A (SMTP) is recommended** — zero code risk, reuses the
> existing branded templates, gives Resend deliverability + dashboard tracking.

## What's already true (no work needed)
- The four auth emails (signup confirm, magic link, password recovery, email
  change) are **already branded**: `supabase/templates/{confirm,magic_link,recovery,email_change}.html`
  are generated from the React components in `web/emails/auth/*` via
  `npm run email:export-auth` and wired in `supabase/config.toml`
  `[auth.email.template.*]`. Re-run the export after editing a component.
- Today these are delivered by **Supabase's built-in mailer**, so they do NOT
  go through Resend (no Resend deliverability/tracking) and write **no**
  `notification_dispatch_log` row.

## Option A — Resend SMTP (recommended)
Supabase sends the existing branded templates via Resend's SMTP relay. Unified
sending domain + Resend's delivery/open/click/bounce tracking. **No code deploy.**

1. **Create a Resend SMTP credential.** Resend dashboard → (SMTP / API keys) →
   get the SMTP host `smtp.resend.com`, port `465`, username `resend`, password =
   a Resend API key.
2. **Hosted Supabase dashboard → Authentication → Emails → SMTP Settings → Enable
   custom SMTP**, and enter:
   - Host: `smtp.resend.com`  Port: `465`
   - Username: `resend`  Password: `<Resend API key>`
   - Sender email: `noreply@tulala.digital`  Sender name: `Tulala`
   - (Sender domain MUST be the Resend-verified `tulala.digital`.)
3. **Local dev parity (optional):** uncomment `[auth.email.smtp]` in
   `supabase/config.toml` and set `RESEND_SMTP_PASSWORD` in your env. (Local only;
   leave it commented if you don't send real auth mail in dev.)
4. **Verify:** trigger a password reset for a real address; confirm the email
   arrives from `noreply@tulala.digital` and appears in the **Resend dashboard**
   (Emails) with delivery status.

Tradeoff: auth emails still won't show in the platform-admin **send-log**
(`notification_dispatch_log`) — Supabase sends them directly. Resend's own
dashboard is the tracking surface. If you want them in our console too, use
Option B.

## Option B — Send Email Hook (Edge Function) — for in-console logging
Supabase calls a Deno Edge Function for every auth email; the function renders +
sends via Resend AND writes a `notification_dispatch_log` row, so auth mail shows
in `/platform/admin/email` alongside everything else. More moving parts (a Deno
function + a hook secret); deploy + test required (Edge Functions run on Deno,
outside this repo's tsc/lint gate).

Steps: create `supabase/functions/send-email-hook/`, deploy with
`supabase functions deploy send-email-hook --no-verify-jwt`, set the function
secrets (`RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`),
then **hosted dashboard → Authentication → Hooks → Send Email Hook** → point at
the function URL + paste the signing secret.

Reference implementation (verify the Standard-Webhooks signature, render per
`email_action_type`, send via Resend, log to dispatch_log):

```ts
// supabase/functions/send-email-hook/index.ts  (Deno) — REFERENCE; deploy + test.
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "https://esm.sh/resend@4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const hook = new Webhook(Deno.env.get("SEND_EMAIL_HOOK_SECRET")!.replace("v1,whsec_", ""));
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FROM = "Tulala <noreply@tulala.digital>";

const SUBJECTS: Record<string, string> = {
  signup: "Confirm your email", magiclink: "Your sign-in link",
  recovery: "Reset your password", email_change: "Confirm your new email",
};

Deno.serve(async (req) => {
  const payload = await req.text();
  let data: any;
  try { data = hook.verify(payload, Object.fromEntries(req.headers)); }
  catch { return new Response("invalid signature", { status: 401 }); }

  const { user, email_data } = data;
  const action = email_data.email_action_type as string;
  const url = `${email_data.redirect_to ?? Deno.env.get("SUPABASE_URL")}/auth/confirm` +
    `?token_hash=${email_data.token_hash}&type=${email_data.email_action_type}`;
  const subject = SUBJECTS[action] ?? "Tulala";
  const html =
    `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">` +
    `<h2>${subject}</h2><p>Use the link below — it expires shortly.</p>` +
    `<p><a href="${url}">${subject}</a></p></div>`;

  const { data: sent, error } = await resend.emails.send({ from: FROM, to: user.email, subject, html });
  // Best-effort console logging (mirror the notification_dispatch_log shape).
  await admin.from("notification_dispatch_log").insert({
    event_kind: `auth.${action}`, channel: "email",
    status: error ? "failed" : "sent", recipient_email: user.email,
    provider_reference: sent?.id ?? null, error_message: error?.message ?? null,
    template_id: `auth.${action}`, catalog_entry_id: `auth.${action}`,
  });
  if (error) return new Response(JSON.stringify({ error }), { status: 500 });
  return new Response("{}", { headers: { "content-type": "application/json" } });
});
```

## Recommendation
Do **Option A** now (5-minute dashboard config, zero risk, gets Resend
deliverability + tracking + the branded templates). Adopt **Option B** later only
if you specifically want auth emails in the platform send-log. Either way the
sender domain must stay the verified `tulala.digital`.
